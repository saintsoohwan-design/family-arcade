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
  // 방 생성 (진행자)
  socket.on('HOST_CREATE_ROOM', () => {
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[roomCode] = {
      hostId: socket.id,
      ph: "lobby", // lobby, count, play, result
      g: null,
      n: 3,
      left: 0,
      players: {}, // socketId -> { name, team }
      scores: {},  // socketId -> val
      tot: [0, 0, 0, 0],
      played: 0
    };
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.emit('ROOM_CREATED', { roomCode });
  });

  // 참가자 방 입장
  socket.on('PLAYER_JOIN', ({ roomCode, name, team }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('ERROR_MSG', '존재하지 않는 방 코드입니다.');
    
    room.players[socket.id] = { name, team };
    room.scores[socket.id] = 0;
    socket.join(roomCode);
    socket.roomCode = roomCode;

    io.to(roomCode).emit('STATE_UPDATE', room);
    socket.emit('JOIN_SUCCESS', { roomCode, name, team });
  });

  // 게임 시작 (진행자)
  socket.on('HOST_START_GAME', ({ roomCode, gKey, duration }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.g = gKey;
    room.scores = {};
    room.ph = "count";
    room.n = 3;

    // 참가자 전체에게 시작 상태 알림
    io.to(roomCode).emit('STATE_UPDATE', room);

    if (room.timer) clearInterval(room.timer);

    room.timer = setInterval(() => {
      if (room.ph === "count") {
        room.n--;
        if (room.n <= 0) {
          room.ph = "play";
          room.left = duration;
        }
        io.to(roomCode).emit('STATE_UPDATE', room);
      } else if (room.ph === "play") {
        room.left--;
        if (room.left < 0) {
          clearInterval(room.timer);
          room.ph = "result";
          room.played++;
          io.to(roomCode).emit('STATE_UPDATE', room);
        } else {
          io.to(roomCode).emit('STATE_UPDATE', room);
        }
      }
    }, 1000);
  });

  // 실시간 점수 송신
  socket.on('PLAYER_SCORE', ({ val }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];

    room.scores[socket.id] = val;
    io.to(room.hostId).emit('LIVE_SCORE_UPDATE', { scores: room.scores });
  });

  // 연결 끊김 처리
  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms[roomCode]) {
      delete rooms[roomCode].players[socket.id];
      delete rooms[roomCode].scores[socket.id];
      io.to(roomCode).emit('STATE_UPDATE', rooms[roomCode]);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행 중 포트: ${PORT}`);
});
