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
      players: {},
      scores: {}
    };
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.emit('ROOM_CREATED', { roomCode });
  });

  // 참가자 입장
  socket.on('PLAYER_JOIN', ({ roomCode, name, team }) => {
    const room = rooms[roomCode];
    if (!room) {
      return socket.emit('ERROR_MSG', '존재하지 않는 방 코드입니다.');
    }
    room.players[socket.id] = { name, team };
    room.scores[socket.id] = 0;
    socket.join(roomCode);
    socket.roomCode = roomCode;

    // 모든 참가자와 진행자에게 갱신된 방 정보 전송
    io.to(roomCode).emit('STATE_UPDATE', room);
    socket.emit('JOIN_SUCCESS');
  });

  // 게임 시작 (진행자)
  socket.on('HOST_START_GAME', ({ roomCode, gKey, duration }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.g = gKey;
    room.scores = {};
    room.ph = "count";
    room.n = 3;

    if (room.timer) clearInterval(room.timer);
    io.to(roomCode).emit('STATE_UPDATE', room);

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
          io.to(roomCode).emit('STATE_UPDATE', room);
        } else {
          io.to(roomCode).emit('STATE_UPDATE', room);
        }
      }
    }, 1000);
  });

  // 점수 수신 (참가자 -> 진행자)
  socket.on('PLAYER_SCORE', ({ val }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    room.scores[socket.id] = val;
    io.to(room.hostId).emit('LIVE_SCORE_UPDATE', { scores: room.scores });
  });

  // 연결 종료 처리
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
  console.log(`멀티플레이어 오락실 서버 실행 중: ${PORT}`);
});
