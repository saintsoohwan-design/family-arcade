const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
  socket.on('CREATE_ROOM', () => {
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[roomCode] = { host: socket.id, players: {}, scores: {}, state: 'lobby', game: null, count: 3, left: 0 };
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.emit('ROOM_CREATED', roomCode);
  });

  socket.on('JOIN_ROOM', ({ roomCode, name, team }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('ERROR', '방을 찾을 수 없습니다.');
    
    room.players[socket.id] = { name, team };
    room.scores[socket.id] = 0;
    socket.join(roomCode);
    socket.roomCode = roomCode;

    io.to(roomCode).emit('UPDATE_ROOM', room);
    socket.emit('JOINED_OK');
  });

  socket.on('START_GAME', ({ roomCode, gameKey, duration }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    room.game = gameKey;
    room.scores = {};
    room.state = 'count';
    room.count = 3;

    if (room.timer) clearInterval(room.timer);
    io.to(roomCode).emit('UPDATE_ROOM', room);

    room.timer = setInterval(() => {
      if (room.state === 'count') {
        room.count--;
        if (room.count <= 0) {
          room.state = 'play';
          room.left = duration;
        }
        io.to(roomCode).emit('UPDATE_ROOM', room);
      } else if (room.state === 'play') {
        room.left--;
        if (room.left < 0) {
          clearInterval(room.timer);
          room.state = 'result';
          io.to(roomCode).emit('UPDATE_ROOM', room);
        } else {
          io.to(roomCode).emit('UPDATE_ROOM', room);
        }
      }
    }, 1000);
  });

  socket.on('SEND_SCORE', (score) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    room.scores[socket.id] = score;
    io.to(room.host).emit('UPDATE_SCORES', room.scores);
  });

  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms[roomCode]) {
      delete rooms[roomCode].players[socket.id];
      delete rooms[roomCode].scores[socket.id];
      io.to(roomCode).emit('UPDATE_ROOM', rooms[roomCode]);
    }
  });
});

server.listen(process.env.PORT || 3000);
