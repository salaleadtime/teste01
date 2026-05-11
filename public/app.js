const socket = io();

let myRole = null;
let myName = null;
let myVote = null;
let currentSettings = { cards: [], hourMap: {} };
let tempSettings = null;

const SESSION_KEY = 'pp_session';

// ─── Session persistence ──────────────────────────────────────────────────────
function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ name: myName, role: myRole }));
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  myName = null; myRole = null; myVote = null;
}

// Auto-join on reconnect (handles page refresh)
socket.on('connect', () => {
  const saved = loadSession();
  if (saved && saved.name && saved.role) {
    myName = saved.name;
    myRole = saved.role;
    socket.emit('join', { name: saved.name, role: saved.role });
    showScreen(saved.role);
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
let selectedRole = 'developer';

document.querySelectorAll('.role-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.role-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRole = btn.dataset.role;
  });
});

document.getElementById('btn-join').addEventListener('click', doJoin);
document.getElementById('input-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doJoin();
});

function doJoin() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { document.getElementById('login-error').classList.remove('hidden'); return; }
  myName = name;
  myRole = selectedRole;
  saveSession();
  socket.emit('join', { name, role: selectedRole });
  showScreen(selectedRole);
}

// ─── Logout ───────────────────────────────────────────────────────────────────
['dev-logout', 'qa-logout', 'master-logout'].forEach((id) => {
  document.getElementById(id)?.addEventListener('click', doLogout);
});

function doLogout() {
  clearSession();
  myVote = null;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById('screen-login').classList.add('active');
  document.getElementById('input-name').value = '';
}

// ─── Developer voting ─────────────────────────────────────────────────────────
document.getElementById('fibonacci-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.fib-card');
  if (!card || card.disabled) return;
  myVote = card.dataset.value;
  document.querySelectorAll('.fib-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  socket.emit('vote', { value: myVote });
  document.getElementById('dev-voted-msg').classList.remove('hidden');
});

// ─── QA voting ────────────────────────────────────────────────────────────────
document.getElementById('btn-qa-vote').addEventListener('click', submitQaVote);
document.getElementById('qa-hours-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitQaVote();
});

function submitQaVote() {
  const val = document.getElementById('qa-hours-input').value;
  if (!val || parseFloat(val) <= 0) return;
  myVote = `${parseFloat(val)}h`;
  socket.emit('vote', { value: myVote });
  document.getElementById('qa-voted-msg').classList.remove('hidden');
  document.getElementById('btn-qa-vote').disabled = true;
  document.getElementById('qa-hours-input').disabled = true;
}

// ─── Master controls ──────────────────────────────────────────────────────────
document.getElementById('btn-copy-result').addEventListener('click', copyResultsAsImage);

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('start_round', { story: document.getElementById('master-story-input').value.trim() });
});
document.getElementById('btn-reveal').addEventListener('click', () => socket.emit('reveal'));
document.getElementById('btn-reset').addEventListener('click', () => { myVote = null; socket.emit('reset'); });

// ─── Settings modal ───────────────────────────────────────────────────────────
document.getElementById('btn-open-settings').addEventListener('click', openSettings);
document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
document.getElementById('btn-cancel-settings').addEventListener('click', closeSettings);
document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
document.getElementById('btn-add-card').addEventListener('click', addCardRow);
document.getElementById('settings-modal').addEventListener('click', (e) => {
  if (e.target.id === 'settings-modal') closeSettings();
});

function openSettings() {
  tempSettings = { cards: [...currentSettings.cards], hourMap: { ...currentSettings.hourMap } };
  renderSettingsRows();
  document.getElementById('settings-modal').classList.remove('hidden');
}
function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
  tempSettings = null;
}

function getAllCardKeys() {
  const all = new Set([...tempSettings.cards, ...Object.keys(tempSettings.hourMap)]);
  const nums = [...all].filter((v) => v !== '?' && !isNaN(parseFloat(v)));
  nums.sort((a, b) => parseFloat(a) - parseFloat(b));
  if (all.has('?')) nums.push('?');
  return nums;
}

function renderSettingsRows() {
  const tbody = document.getElementById('settings-rows');
  tbody.innerHTML = '';
  getAllCardKeys().forEach((val) => {
    const isActive = tempSettings.cards.includes(val);
    const hours = tempSettings.hourMap[val] || '';
    const tr = document.createElement('tr');
    tr.dataset.cardVal = val;
    tr.innerHTML = `
      <td><strong>${val}</strong></td>
      <td><input class="s-input h-edit" type="text" value="${hours}" placeholder="ex: 8h" data-val="${val}" /></td>
      <td>
        <label class="toggle">
          <input type="checkbox" class="a-toggle" data-val="${val}" ${isActive ? 'checked' : ''} />
          <span class="t-slider"></span>
        </label>
      </td>
      <td><button class="btn-del" data-val="${val}" title="Remover">🗑</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.val;
      tempSettings.cards = tempSettings.cards.filter((c) => c !== v);
      delete tempSettings.hourMap[v];
      renderSettingsRows();
    });
  });
}

function addCardRow() {
  const valIn = document.getElementById('new-card-value');
  const hIn = document.getElementById('new-card-hours');
  const val = valIn.value.trim();
  if (!val) return;
  if (!tempSettings.cards.includes(val)) tempSettings.cards.push(val);
  if (hIn.value.trim()) tempSettings.hourMap[val] = hIn.value.trim();
  valIn.value = ''; hIn.value = '';
  renderSettingsRows();
}

function saveSettings() {
  document.getElementById('settings-rows').querySelectorAll('tr').forEach((tr) => {
    const val = tr.dataset.cardVal;
    const h = tr.querySelector('.h-edit');
    const active = tr.querySelector('.a-toggle');
    if (h) tempSettings.hourMap[val] = h.value.trim();
    if (active) {
      if (active.checked) { if (!tempSettings.cards.includes(val)) tempSettings.cards.push(val); }
      else tempSettings.cards = tempSettings.cards.filter((c) => c !== val);
    }
  });
  const nums = tempSettings.cards.filter((v) => v !== '?' && !isNaN(parseFloat(v)));
  nums.sort((a, b) => parseFloat(a) - parseFloat(b));
  const hasQ = tempSettings.cards.includes('?');
  tempSettings.cards = hasQ ? [...nums, '?'] : nums;
  currentSettings = { ...tempSettings };
  socket.emit('update_settings', currentSettings);
  closeSettings();
}

// ─── Socket events ────────────────────────────────────────────────────────────
socket.on('state_update', ({ participants, round, settings, allVoted }) => {
  if (settings) currentSettings = settings;
  if (myRole === 'developer') { updateDevView(participants, round); updateParticipants(participants, 'dev-participants'); }
  else if (myRole === 'qa')   { updateQaView(participants, round);  updateParticipants(participants, 'qa-participants'); }
  else if (myRole === 'master') { updateMasterView(participants, round, allVoted); updateParticipants(participants, 'master-participants'); }
});

// ─── Developer view ───────────────────────────────────────────────────────────
function updateDevView(participants, round) {
  setStoryLabel('dev-story', round.story);
  const waiting = document.getElementById('dev-waiting');
  const voting  = document.getElementById('dev-voting');
  const reveal  = document.getElementById('dev-reveal');

  if (!round.active) {
    show(waiting); hide(voting); hide(reveal);
    resetDevCards(); return;
  }
  hide(waiting);
  if (round.revealed) {
    hide(voting); show(reveal);
    renderSimpleTable('dev-results-table', participants);
  } else {
    hide(reveal); show(voting);
    renderFibCards();
  }
}

function renderFibCards() {
  const container = document.getElementById('fibonacci-cards');
  container.innerHTML = '';
  currentSettings.cards.forEach((val) => {
    const hours = currentSettings.hourMap[val] || '';
    const btn = document.createElement('button');
    btn.className = 'fib-card' + (myVote === val ? ' selected' : '');
    btn.dataset.value = val;
    btn.innerHTML = `<span class="fib-value">${val}</span>${hours ? `<span class="fib-hours">${hours}</span>` : ''}`;
    container.appendChild(btn);
  });
}

function resetDevCards() {
  myVote = null;
  renderFibCards();
  document.getElementById('dev-voted-msg').classList.add('hidden');
}

// ─── QA view ─────────────────────────────────────────────────────────────────
function updateQaView(participants, round) {
  setStoryLabel('qa-story', round.story);
  const waiting = document.getElementById('qa-waiting');
  const voting  = document.getElementById('qa-voting');
  const reveal  = document.getElementById('qa-reveal');

  if (!round.active) {
    show(waiting); hide(voting); hide(reveal);
    resetQaInput(); return;
  }
  hide(waiting);
  if (round.revealed) {
    hide(voting); show(reveal);
    renderSimpleTable('qa-results-table', participants);
  } else {
    hide(reveal); show(voting);
  }
}

function resetQaInput() {
  myVote = null;
  document.getElementById('qa-hours-input').value = '';
  document.getElementById('qa-hours-input').disabled = false;
  document.getElementById('btn-qa-vote').disabled = false;
  document.getElementById('qa-voted-msg').classList.add('hidden');
}

// ─── Master view ──────────────────────────────────────────────────────────────
function updateMasterView(participants, round, allVoted) {
  setStoryLabel('master-story-display', round.story);
  const setup  = document.getElementById('master-setup');
  const active = document.getElementById('master-active');
  const results = document.getElementById('master-results');

  if (!round.active) {
    show(setup); hide(active);
    document.getElementById('master-story-input').value = ''; return;
  }
  hide(setup); show(active);
  document.getElementById('btn-reveal').disabled = !allVoted;
  renderVoteGrid(participants, round.revealed);

  if (round.revealed) { show(results); renderSplitResults(participants); renderSummary(participants); }
  else hide(results);
}

// ─── Vote status grid ─────────────────────────────────────────────────────────
function renderVoteGrid(participants, revealed) {
  const grid = document.getElementById('master-vote-status');
  grid.innerHTML = '';
  participants.filter((p) => p.role !== 'master').forEach((p) => {
    const card = document.createElement('div');
    card.className = 'vote-status-card';
    let pill;
    if (revealed && p.vote !== null) {
      const cls = p.role === 'qa' ? 'val-qa' : 'val-dev';
      pill = `<span class="vs-pill ${cls}">${p.vote}</span>`;
    } else if (p.hasVoted) {
      pill = `<span class="vs-pill voted">Votou ✓</span>`;
    } else {
      pill = `<span class="vs-pill pending">Aguardando…</span>`;
    }
    card.innerHTML = `<div class="vs-name">${p.name}</div><div class="vs-role">${roleLabel(p.role)}</div>${pill}`;
    grid.appendChild(card);
  });
}

// ─── Split results (SM) ───────────────────────────────────────────────────────
function calcMode(votes) {
  // Returns the most frequent value; on tie, returns the lowest numeric value
  const freq = {};
  votes.forEach((v) => { freq[v] = (freq[v] || 0) + 1; });
  let maxFreq = 0;
  let mode = null;
  for (const [val, count] of Object.entries(freq)) {
    const wins = count > maxFreq || (count === maxFreq && parseFloat(val) < parseFloat(mode));
    if (wins) { maxFreq = count; mode = val; }
  }
  return { mode, count: maxFreq, total: votes.length };
}

function renderSplitResults(participants) {
  const devs = participants.filter((p) => p.role === 'developer');
  const qas  = participants.filter((p) => p.role === 'qa');

  // Find predominant dev vote
  const devVotes = devs.filter((p) => p.vote && p.vote !== '?').map((p) => p.vote);
  const { mode: modeVote, count: modeCount } = devVotes.length ? calcMode(devVotes) : {};

  const devRows = devs.map((p) => {
    const hours = p.vote ? (currentSettings.hourMap[p.vote] || '') : '';
    const isPredominant = p.vote && p.vote === modeVote;
    const chip = p.vote
      ? `<span class="vote-chip developer ${isPredominant ? 'vote-winner' : ''}"><span class="chip-points">${p.vote}</span>${hours ? `<span class="chip-hours">${hours}</span>` : ''}</span>`
      : `<span style="color:var(--muted)">—</span>`;
    const tag = isPredominant ? `<span class="winner-tag">✓</span>` : '';
    return `<tr><td>${p.name}${tag}</td><td>${chip}</td></tr>`;
  }).join('') || `<tr><td colspan="2" style="color:var(--muted);font-size:.85rem">Nenhum desenvolvedor</td></tr>`;

  // QA average
  const qaHours = qas.filter((p) => p.vote).map((p) => parseFloat(p.vote)).filter((v) => !isNaN(v));
  const avgQaH = qaHours.length ? (qaHours.reduce((a, b) => a + b, 0) / qaHours.length) : null;

  const qaRows = qas.map((p) => {
    const chip = p.vote
      ? `<span class="vote-chip qa"><span class="chip-points">${p.vote}</span></span>`
      : `<span style="color:var(--muted)">—</span>`;
    return `<tr><td>${p.name}</td><td>${chip}</td></tr>`;
  }).join('') || `<tr><td colspan="2" style="color:var(--muted);font-size:.85rem">Nenhum QA</td></tr>`;

  const devFooter = modeVote
    ? `<tfoot><tr><td colspan="2" class="table-footer">Voto predominante: <strong>${modeVote}</strong> (${modeCount}/${devVotes.length} devs) = <strong>${currentSettings.hourMap[modeVote] || '?'}</strong></td></tr></tfoot>`
    : '';
  const qaFooter = avgQaH !== null
    ? `<tfoot><tr><td colspan="2" class="table-footer">Média QA: <strong>${avgQaH % 1 === 0 ? avgQaH : avgQaH.toFixed(1)}h</strong></td></tr></tfoot>`
    : '';

  document.getElementById('master-dev-results').innerHTML =
    `<table class="results-table"><thead><tr><th>Nome</th><th>Pontos / Horas</th></tr></thead><tbody>${devRows}</tbody>${devFooter}</table>`;
  document.getElementById('master-qa-results').innerHTML =
    `<table class="results-table"><thead><tr><th>Nome</th><th>Estimativa</th></tr></thead><tbody>${qaRows}</tbody>${qaFooter}</table>`;
}

// ─── Simple table (dev/qa screens) ───────────────────────────────────────────
function renderSimpleTable(containerId, participants) {
  const rows = participants.filter((p) => p.role !== 'master').map((p) => {
    const hours = (p.role === 'developer' && p.vote) ? (currentSettings.hourMap[p.vote] || '') : '';
    const chip = p.vote
      ? `<span class="vote-chip ${p.role}"><span class="chip-points">${p.vote}</span>${hours ? `<span class="chip-hours">${hours}</span>` : ''}</span>`
      : `<span style="color:var(--muted)">—</span>`;
    return `<tr><td>${p.name}</td><td><span class="badge badge-${p.role}">${roleLabel(p.role)}</span></td><td>${chip}</td></tr>`;
  }).join('');
  document.getElementById(containerId).innerHTML =
    `<table class="results-table"><thead><tr><th>Nome</th><th>Papel</th><th>Estimativa</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function renderSummary(participants) {
  const box = document.getElementById('master-summary');
  const devVoters = participants.filter((p) => p.role === 'developer' && p.vote && p.vote !== '?');
  const qaVoters  = participants.filter((p) => p.role === 'qa' && p.vote);
  const stats = [];

  let devHoursNum = 0;

  if (devVoters.length) {
    // Use MODE (most frequent vote) — not average
    const { mode: modeVote, count: modeCount } = calcMode(devVoters.map((p) => p.vote));
    const modeHoursStr = currentSettings.hourMap[modeVote] || '';
    devHoursNum = parseFloat(modeHoursStr) || 0;

    stats.push(`<div class="summary-stat"><div class="stat-value">${modeVote}</div><div class="stat-label">Voto Predominante Dev</div></div>`);
    if (modeHoursStr) stats.push(`<div class="summary-stat"><div class="stat-value">${modeHoursStr}</div><div class="stat-label">Horas Dev (${modeCount}/${devVoters.length} devs)</div></div>`);
    stats.push('<div class="summary-divider"></div>');
  }

  if (qaVoters.length) {
    // Use AVERAGE — not sum
    const qaH = qaVoters.map((p) => parseFloat(p.vote)).filter((v) => !isNaN(v));
    const avgQaH = qaH.length ? qaH.reduce((a, b) => a + b, 0) / qaH.length : 0;
    const avgQaDisplay = avgQaH % 1 === 0 ? `${avgQaH}h` : `${avgQaH.toFixed(1)}h`;

    stats.push(`<div class="summary-stat stat-qa"><div class="stat-value">${avgQaDisplay}</div><div class="stat-label">Média Horas QA (${qaVoters.length} QAs)</div></div>`);

    if (devVoters.length && (devHoursNum + avgQaH) > 0) {
      const grand = devHoursNum + avgQaH;
      const grandDisplay = grand % 1 === 0 ? `${grand}h` : `${grand.toFixed(1)}h`;
      stats.push('<div class="summary-divider"></div>');
      stats.push(`<div class="summary-stat stat-total"><div class="stat-value">${grandDisplay}</div><div class="stat-label">Total Geral Dev+QA</div></div>`);
    }
  }

  box.innerHTML = stats.length ? `<div class="summary-box">${stats.join('')}</div>` : '';
}

// ─── Participants ─────────────────────────────────────────────────────────────
function updateParticipants(participants, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'participant-list';
  participants.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = 'participant-chip';
    chip.innerHTML = `<span class="p-dot ${p.role}"></span><span>${p.name}</span><span style="font-size:.68rem;color:var(--muted)">${roleLabel(p.role)}</span>`;
    list.appendChild(chip);
  });
  el.appendChild(list);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showScreen(role) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${role}`)?.classList.add('active');
  const nameEl = document.getElementById(`${role}-name`);
  if (nameEl) nameEl.textContent = myName;
}
function setStoryLabel(id, story) {
  const el = document.getElementById(id);
  if (!el) return;
  if (story) { el.textContent = story; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}
function show(el) { el?.classList.remove('hidden'); }
function hide(el) { el?.classList.add('hidden'); }
function roleLabel(role) { return { developer: 'Dev', qa: 'QA', master: 'SM' }[role] || role; }

// ─── Copy results as image for Jira ──────────────────────────────────────────
async function copyResultsAsImage() {
  const btn = document.getElementById('btn-copy-result');
  btn.textContent = '⏳ Gerando...';
  btn.disabled = true;

  try {
    const area = document.getElementById('capture-area');
    const story = document.getElementById('master-story-display').textContent.trim();
    const now = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const canvas = await html2canvas(area, { backgroundColor: '#ffffff', scale: 2, useCORS: true });

    // Draw header band with story + timestamp
    const finalW = canvas.width;
    const headerH = 72;
    const final = document.createElement('canvas');
    final.width = finalW;
    final.height = canvas.height + headerH;

    const ctx = final.getContext('2d');

    // Header background (Jira blue gradient)
    const grad = ctx.createLinearGradient(0, 0, finalW, 0);
    grad.addColorStop(0, '#1a1035');
    grad.addColorStop(1, '#cc092f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, finalW, headerH);

    // Header text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${headerH * 0.36}px Segoe UI, sans-serif`;
    ctx.fillText('🃏 Planning Poker', 28, headerH * 0.48);

    ctx.font = `${headerH * 0.26}px Segoe UI, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const subtitle = story ? `${story}  ·  ${now}` : now;
    ctx.fillText(subtitle, 28, headerH * 0.82);

    // Paste captured content below header
    ctx.drawImage(canvas, 0, headerH);

    // Copy to clipboard
    final.toBlob(async (blob) => {
      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copied = true;
      } catch (_) {}

      if (copied) {
        btn.textContent = '✅ Copiado! Cole no Jira (Ctrl+V)';
        setTimeout(() => { btn.textContent = '📸 Copiar para Jira'; btn.disabled = false; }, 3000);
      } else {
        // Fallback: download PNG
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `planning-poker-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        btn.textContent = '📥 Baixado!';
        setTimeout(() => { btn.textContent = '📸 Copiar para Jira'; btn.disabled = false; }, 2500);
      }
    }, 'image/png');
  } catch (err) {
    console.error(err);
    btn.textContent = '❌ Erro — tente novamente';
    btn.disabled = false;
  }
}
