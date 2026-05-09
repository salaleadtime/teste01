const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// State
const state = {
  participants: {},   // socketId -> { name, role, vote, revealed }
  round: {
    active: false,
    story: '',
    revealed: false,
  },
};

function broadcastState() {
  const participants = Object.values(state.participants).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    hasVoted: p.vote !== null,
    vote: state.round.revealed ? p.vote : null,
  }));

  const allVoted =
    participants.length > 0 &&
    participants.every((p) => p.role === 'master' || p.hasVoted);

  io.emit('state_update', {
    participants,
    round: state.round,
    allVoted,
  });
}

io.on('connection', (socket) => {
  socket.on('join', ({ name, role }) => {
    state.participants[socket.id] = {
      id: socket.id,
      name: name.trim(),
      role,
      vote: null,
    };
    broadcastState();
  });

  socket.on('vote', ({ value }) => {
    const participant = state.participants[socket.id];
    if (!participant || participant.role === 'master') return;
    if (!state.round.active || state.round.revealed) return;
    participant.vote = value;
    broadcastState();
  });

  socket.on('start_round', ({ story }) => {
    const participant = state.participants[socket.id];
    if (!participant || participant.role !== 'master') return;

    state.round = { active: true, story: story || '', revealed: false };
    Object.values(state.participants).forEach((p) => {
      p.vote = null;
    });
    broadcastState();
  });

  socket.on('reveal', () => {
    const participant = state.participants[socket.id];
    if (!participant || participant.role !== 'master') return;
    if (!state.round.active) return;
    state.round.revealed = true;
    broadcastState();
  });

  socket.on('reset', () => {
    const participant = state.participants[socket.id];
    if (!participant || participant.role !== 'master') return;

    state.round = { active: false, story: '', revealed: false };
    Object.values(state.participants).forEach((p) => {
      p.vote = null;
    });
    broadcastState();
  });

  socket.on('disconnect', () => {
    delete state.participants[socket.id];
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
