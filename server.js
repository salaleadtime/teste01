const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const SM_TOKEN = process.env.SM_TOKEN || crypto.randomBytes(8).toString('hex');

const DEFAULT_CARDS = ['1', '2', '3', '5', '8', '13', '21', '?'];
const DEFAULT_HOUR_MAP = {
  '1': '2h', '2': '4h', '3': '8h', '4': '12h',
  '5': '16h', '6': '20h', '8': '24h', '9': '32h',
  '10': '40h', '11': '48h', '13': '60h', '21': '80h',
  '22': '1 Sprint', '?': '?',
};

const state = {
  participants: {},
  round: { active: false, story: '', revealed: false },
  settings: { cards: [...DEFAULT_CARDS], hourMap: { ...DEFAULT_HOUR_MAP }, squads: [] },
};

function broadcastState() {
  const participants = Object.values(state.participants).map((p) => ({
    id: p.id, name: p.name, role: p.role, squad: p.squad || null,
    hasVoted: p.vote !== null,
    vote: state.round.revealed ? p.vote : null,
  }));

  const voters = participants.filter((p) => p.role !== 'master' && p.role !== 'observer');
  const allVoted = voters.length > 0 && voters.every((p) => p.hasVoted);

  io.emit('state_update', { participants, round: state.round, settings: state.settings, allVoted });
}

io.on('connection', (socket) => {
  socket.on('join', ({ name, role, squad, smToken }) => {
    if (role === 'master' && smToken !== SM_TOKEN) {
      socket.emit('join_error', 'Token de Scrum Master inválido. Use o link correto.');
      return;
    }
    state.participants[socket.id] = {
      id: socket.id, name: name.trim(), role, squad: squad || null, vote: null,
    };
    if (role === 'master') socket.emit('sm_token_info', { token: SM_TOKEN });
    broadcastState();
  });

  socket.on('vote', ({ value }) => {
    const p = state.participants[socket.id];
    if (!p || p.role === 'master' || p.role === 'observer') return;
    if (!state.round.active || state.round.revealed) return;
    p.vote = value;
    broadcastState();
  });

  socket.on('start_round', ({ story }) => {
    const p = state.participants[socket.id];
    if (!p || p.role !== 'master') return;
    state.round = { active: true, story: story || '', revealed: false };
    Object.values(state.participants).forEach((x) => { x.vote = null; });
    broadcastState();
  });

  socket.on('reveal', () => {
    const p = state.participants[socket.id];
    if (!p || p.role !== 'master' || !state.round.active) return;
    state.round.revealed = true;
    broadcastState();
  });

  socket.on('reset', () => {
    const p = state.participants[socket.id];
    if (!p || p.role !== 'master') return;
    state.round = { active: false, story: '', revealed: false };
    Object.values(state.participants).forEach((x) => { x.vote = null; });
    broadcastState();
  });

  socket.on('update_settings', ({ cards, hourMap, squads }) => {
    const p = state.participants[socket.id];
    if (!p || p.role !== 'master') return;
    state.settings = { cards, hourMap, squads: squads || [] };
    Object.values(state.participants).forEach((x) => { x.vote = null; });
    broadcastState();
  });

  socket.on('kick', ({ targetId }) => {
    const p = state.participants[socket.id];
    if (!p || p.role !== 'master') return;
    if (state.participants[targetId]) {
      io.to(targetId).emit('force_logout');
      delete state.participants[targetId];
      broadcastState();
    }
  });

  socket.on('disconnect', () => {
    delete state.participants[socket.id];
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor: http://localhost:${PORT}`);
  console.log(`SM URL:   http://localhost:${PORT}?sm=${SM_TOKEN}`);
});
