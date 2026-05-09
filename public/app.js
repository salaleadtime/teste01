const socket = io();

let myRole = null;
let myName = null;
let myVote = null;
let roundActive = false;
let roundRevealed = false;

// ─── Login ───────────────────────────────────────────────────────────────────
let selectedRole = 'developer';

document.querySelectorAll('.role-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.role-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRole = btn.dataset.role;
  });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const name = document.getElementById('input-name').value.trim();
  if (!name) {
    document.getElementById('login-error').classList.remove('hidden');
    return;
  }
  myName = name;
  myRole = selectedRole;
  socket.emit('join', { name, role: selectedRole });
  showScreen(selectedRole);
});

document.getElementById('input-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// ─── Developer voting ────────────────────────────────────────────────────────
document.querySelectorAll('.fib-card').forEach((card) => {
  card.addEventListener('click', () => {
    if (roundRevealed) return;
    const value = card.dataset.value;
    myVote = value;
    document.querySelectorAll('.fib-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    socket.emit('vote', { value });
    document.getElementById('dev-voted-msg').classList.remove('hidden');
  });
});

// ─── QA voting ───────────────────────────────────────────────────────────────
document.getElementById('btn-qa-vote').addEventListener('click', submitQaVote);
document.getElementById('qa-hours-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitQaVote();
});

function submitQaVote() {
  const val = document.getElementById('qa-hours-input').value;
  if (!val || parseFloat(val) <= 0) return;
  myVote = `${val}h`;
  socket.emit('vote', { value: myVote });
  document.getElementById('qa-voted-msg').classList.remove('hidden');
  document.getElementById('btn-qa-vote').disabled = true;
  document.getElementById('qa-hours-input').disabled = true;
}

// ─── Master controls ──────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  const story = document.getElementById('master-story-input').value.trim();
  socket.emit('start_round', { story });
});

document.getElementById('btn-reveal').addEventListener('click', () => {
  socket.emit('reveal');
});

document.getElementById('btn-reset').addEventListener('click', () => {
  socket.emit('reset');
});

// ─── Socket events ───────────────────────────────────────────────────────────
socket.on('state_update', (data) => {
  const { participants, round, allVoted } = data;
  roundActive = round.active;
  roundRevealed = round.revealed;

  updateForRole(participants, round, allVoted);
  updateParticipants(participants);
});

// ─── Role views ──────────────────────────────────────────────────────────────
function updateForRole(participants, round, allVoted) {
  if (myRole === 'developer') updateDeveloperView(participants, round, allVoted);
  if (myRole === 'qa')        updateQaView(participants, round, allVoted);
  if (myRole === 'master')    updateMasterView(participants, round, allVoted);
}

function updateDeveloperView(participants, round, allVoted) {
  const waiting = document.getElementById('dev-waiting');
  const voting  = document.getElementById('dev-voting');
  const reveal  = document.getElementById('dev-reveal');
  const story   = document.getElementById('dev-story');

  setStoryLabel(story, round.story);

  if (!round.active) {
    waiting.classList.remove('hidden');
    voting.classList.add('hidden');
    reveal.classList.add('hidden');
    resetDevCards();
    return;
  }

  waiting.classList.add('hidden');

  if (round.revealed) {
    voting.classList.add('hidden');
    reveal.classList.remove('hidden');
    renderResultsTable('dev-results-table', participants);
  } else {
    reveal.classList.add('hidden');
    voting.classList.remove('hidden');
  }
}

function updateQaView(participants, round, allVoted) {
  const waiting = document.getElementById('qa-waiting');
  const voting  = document.getElementById('qa-voting');
  const reveal  = document.getElementById('qa-reveal');
  const story   = document.getElementById('qa-story');

  setStoryLabel(story, round.story);

  if (!round.active) {
    waiting.classList.remove('hidden');
    voting.classList.add('hidden');
    reveal.classList.add('hidden');
    resetQaInput();
    return;
  }

  waiting.classList.add('hidden');

  if (round.revealed) {
    voting.classList.add('hidden');
    reveal.classList.remove('hidden');
    renderResultsTable('qa-results-table', participants);
  } else {
    reveal.classList.add('hidden');
    voting.classList.remove('hidden');
  }
}

function updateMasterView(participants, round, allVoted) {
  const setup   = document.getElementById('master-setup');
  const active  = document.getElementById('master-active');
  const results = document.getElementById('master-results');
  const story   = document.getElementById('master-story-display');
  const btnReveal = document.getElementById('btn-reveal');

  setStoryLabel(story, round.story);

  if (!round.active) {
    setup.classList.remove('hidden');
    active.classList.add('hidden');
    document.getElementById('master-story-input').value = '';
    return;
  }

  setup.classList.add('hidden');
  active.classList.remove('hidden');

  btnReveal.disabled = !allVoted;

  renderVoteStatusGrid(participants, round.revealed);

  if (round.revealed) {
    results.classList.remove('hidden');
    renderResultsTable('master-results-table', participants);
    renderSummary(participants);
  } else {
    results.classList.add('hidden');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function showScreen(role) {
  document.getElementById('screen-login').classList.remove('active');
  const screen = document.getElementById(`screen-${role}`);
  screen.classList.add('active');
  document.getElementById(`${role}-name`).textContent = myName;
}

function setStoryLabel(el, story) {
  if (story) {
    el.textContent = story;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function resetDevCards() {
  myVote = null;
  document.querySelectorAll('.fib-card').forEach((c) => {
    c.classList.remove('selected');
    c.disabled = false;
  });
  document.getElementById('dev-voted-msg').classList.add('hidden');
}

function resetQaInput() {
  myVote = null;
  const input = document.getElementById('qa-hours-input');
  const btn   = document.getElementById('btn-qa-vote');
  input.value = '';
  input.disabled = false;
  btn.disabled = false;
  document.getElementById('qa-voted-msg').classList.add('hidden');
}

function updateParticipants(participants) {
  const panels = {
    developer: 'dev-participants',
    qa:        'qa-participants',
    master:    'master-participants',
  };

  const target = panels[myRole];
  if (!target) return;
  const el = document.getElementById(target);
  el.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'participant-list';

  participants.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = 'participant-chip';
    chip.innerHTML = `
      <span class="participant-dot ${p.role}"></span>
      <span>${p.name}</span>
      <span style="font-size:.75rem;color:var(--text-muted)">${roleLabel(p.role)}</span>
    `;
    list.appendChild(chip);
  });

  el.appendChild(list);
}

function renderVoteStatusGrid(participants, revealed) {
  const grid = document.getElementById('master-vote-status');
  grid.innerHTML = '';

  const voters = participants.filter((p) => p.role !== 'master');

  voters.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'vote-status-card';

    let pillHtml;
    if (revealed && p.vote !== null) {
      const cls = p.role === 'qa' ? 'qa-value' : '';
      pillHtml = `<span class="vs-pill value ${cls}">${p.vote}</span>`;
    } else if (p.hasVoted) {
      pillHtml = `<span class="vs-pill voted">Votou ✓</span>`;
    } else {
      pillHtml = `<span class="vs-pill pending">Aguardando…</span>`;
    }

    card.innerHTML = `
      <div class="vs-name">${p.name}</div>
      <div class="vs-role">${roleLabel(p.role)}</div>
      ${pillHtml}
    `;
    grid.appendChild(card);
  });
}

function renderResultsTable(containerId, participants) {
  const container = document.getElementById(containerId);
  const voters = participants.filter((p) => p.role !== 'master');

  const rows = voters.map((p) => {
    const voteDisplay = p.vote !== null
      ? `<span class="vote-chip ${p.role}">${p.vote}</span>`
      : `<span style="color:var(--text-muted)">—</span>`;
    return `
      <tr>
        <td>${p.name}</td>
        <td><span class="badge badge-${p.role}">${roleLabel(p.role)}</span></td>
        <td>${voteDisplay}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="results-table">
      <thead><tr><th>Nome</th><th>Papel</th><th>Estimativa</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderSummary(participants) {
  const box = document.getElementById('master-summary');
  const devs = participants.filter((p) => p.role === 'developer' && p.vote !== null && p.vote !== '?');
  const qas  = participants.filter((p) => p.role === 'qa' && p.vote !== null);

  let devStats = '';
  if (devs.length) {
    const values = devs.map((p) => Number(p.vote));
    const avg  = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
    const min  = Math.min(...values);
    const max  = Math.max(...values);
    devStats = `
      <div class="summary-stat"><div class="stat-value">${avg}</div><div class="stat-label">Média Devs</div></div>
      <div class="summary-stat"><div class="stat-value">${min}</div><div class="stat-label">Mínimo</div></div>
      <div class="summary-stat"><div class="stat-value">${max}</div><div class="stat-label">Máximo</div></div>
    `;
  }

  let qaStats = '';
  if (qas.length) {
    const values = qas.map((p) => parseFloat(p.vote));
    const total = values.reduce((a, b) => a + b, 0).toFixed(1);
    const avgH  = (total / values.length).toFixed(1);
    qaStats = `
      <div class="summary-stat qa-stat"><div class="stat-value">${avgH}h</div><div class="stat-label">Média QA (horas)</div></div>
      <div class="summary-stat qa-stat"><div class="stat-value">${total}h</div><div class="stat-label">Total QA</div></div>
    `;
  }

  if (!devStats && !qaStats) { box.innerHTML = ''; return; }

  box.innerHTML = `<div class="master-summary-box">${devStats}${qaStats}</div>`;
}

function roleLabel(role) {
  return { developer: 'Dev', qa: 'QA', master: 'Master' }[role] || role;
}
