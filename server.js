const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

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
  settings: { cards: [...DEFAULT_CARDS], hourMap: { ...DEFAULT_HOUR_MAP } },
};

function broadcastState() {
  const participants = Object.values(state.participants).map((p) => ({
    id: p.id, name: p.name, role: p.role,
    hasVoted: p.vote !== null,
    vote: state.round.revealed ? p.vote : null,
  }));

  const allVoted =
    participants.length > 0 &&
    participants.every((p) => p.role === 'master' || p.hasVoted);

  io.emit('state_update', { participants, round: state.round, settings: state.settings, allVoted });
}

io.on('connection', (socket) => {
  socket.on('join', ({ name, role }) => {
    state.participants[socket.id] = { id: socket.id, name: name.trim(), role, vote: null };
    broadcastState();
  });

  socket.on('vote', ({ value }) => {
    const p = state.participants[socket.id];
    if (!p || p.role === 'master' || !state.round.active || state.round.revealed) return;
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

  socket.on('update_settings', ({ cards, hourMap }) => {
    const p = state.participants[socket.id];
    if (!p || p.role !== 'master') return;
    state.settings = { cards, hourMap };
    Object.values(state.participants).forEach((x) => { x.vote = null; });
    broadcastState();
  });

  socket.on('disconnect', () => {
    delete state.participants[socket.id];
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
