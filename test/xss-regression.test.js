const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8793;

const server = http.createServer((req, res) => {
  const filePath = path.join(DOCS_DIR, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404); res.end('not found');
  }
});

// Mock of the Firebase Realtime Database client SDK — no network calls, no
// real project touched. Everything no-ops except rooms/*/history, which
// returns two canned entries with the same date|story signature (same
// clock minute, different Firebase push keys) to exercise the dedup fix
// in loadMergedHistory() with the app's real, unmodified code.
function installFirebaseMock() {
  function emptySnap() { return { exists: () => false, val: () => null, forEach: () => {} }; }
  function historySnap() {
    const children = [
      { key: 'k1', val: () => ({ date: '01/07/2026, 14:32', story: 'Login com SSO', devMode: '5', _ts: 1000 }) },
      { key: 'k2', val: () => ({ date: '01/07/2026, 14:32', story: 'Login com SSO', devMode: '8', _ts: 1030 }) },
    ];
    return { exists: () => true, forEach: (cb) => children.forEach(cb) };
  }
  function ref(p) {
    const isHistory = /\/history$/.test(p);
    return {
      once: async () => (isHistory ? historySnap() : emptySnap()),
      on: (event, cb) => { cb(emptySnap()); },
      off: () => {},
      set: async () => {},
      update: async () => {},
      remove: async () => {},
      push: () => ({ key: 'mockKey' + Math.random().toString(36).slice(2) }),
      orderByChild: () => ref(p),
      onDisconnect: () => ({ remove: () => {} }),
    };
  }
  window.firebase = { initializeApp: () => {}, database: () => ({ ref }) };
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage();

  let xssFired = false;
  page.on('dialog', async (d) => { xssFired = true; await d.dismiss(); });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.route('**/firebasejs/**/firebase-app-compat.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `(${installFirebaseMock.toString()})();`,
  }));
  await page.route('**/firebasejs/**/firebase-database-compat.js', (route) => route.fulfill({
    contentType: 'application/javascript', body: '/* stub, mock installed by firebase-app-compat stub */',
  }));
  await page.route('**/html2canvas*/**', (route) => route.fulfill({ contentType: 'application/javascript', body: '/* stub, unused by this test */' }));
  await page.route('**/xlsx*/**', (route) => route.fulfill({ contentType: 'application/javascript', body: 'window.XLSX = {};' }));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });

  const PAYLOAD = '<img src=x onerror="window.__xssFired = true">';
  let failures = [];

  // TEST 1 — fibonacci cards (seen by every participant while voting) must
  // escape a malicious card value / hour string set by the Scrum Master.
  const t1 = await page.evaluate(async (payload) => {
    window.__xssFired = false;
    currentSettings = { cards: [payload], hourMap: { [payload]: payload }, squads: [] };
    renderFibCards();
    await new Promise((r) => setTimeout(r, 200));
    return { fired: window.__xssFired, html: document.getElementById('fibonacci-cards').innerHTML };
  }, PAYLOAD);
  console.log('[1/3] renderFibCards escapa carta/hora maliciosa:', !t1.fired ? 'OK' : 'FALHOU');
  if (t1.fired || !t1.html.includes('&lt;img')) failures.push('renderFibCards não escapou o payload');

  // TEST 2 — participants management tab (seen by the Scrum Master) must
  // escape a malicious participant name / squad.
  const t2 = await page.evaluate(async (payload) => {
    window.__xssFired = false;
    _latestParticipants = [{ id: 'p1', name: payload, role: 'developer', squad: payload, avatar: '' }];
    renderParticipantsManage();
    await new Promise((r) => setTimeout(r, 200));
    return { fired: window.__xssFired, html: document.getElementById('participants-manage').innerHTML };
  }, PAYLOAD);
  console.log('[2/3] renderParticipantsManage escapa nome/squad malicioso:', !t2.fired ? 'OK' : 'FALHOU');
  if (t2.fired || !t2.html.includes('&lt;img')) failures.push('renderParticipantsManage não escapou o payload');

  // TEST 3 — loadMergedHistory() must not silently drop a legitimate second
  // estimate of the same story within the same clock minute (regression for
  // the old Set-based date|story dedup).
  const t3 = await page.evaluate(async () => {
    const entries = await loadMergedHistory('test-room-ci');
    return { count: entries.length, devModes: entries.map((e) => e.devMode).sort() };
  });
  const t3ok = t3.count === 2 && JSON.stringify(t3.devModes) === JSON.stringify(['5', '8']);
  console.log('[3/3] loadMergedHistory mantém as 2 reestimativas do mesmo minuto:', t3ok ? 'OK' : `FALHOU (recebeu ${t3.count})`);
  if (!t3ok) failures.push('loadMergedHistory descartou uma reestimativa legítima');

  if (pageErrors.length) {
    console.log('Erros de página inesperados:', pageErrors);
    failures.push('erros de página inesperados');
  }

  await browser.close();
  server.close();

  if (failures.length) {
    console.error('\nFALHOU:', failures.join('; '));
    process.exit(1);
  }
  console.log('\nTodos os testes de regressão passaram.');
}

main().catch((err) => { console.error(err); process.exit(1); });
