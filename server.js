const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// 방 상태 관리 (방코드 -> 방정보)
const rooms = {};

// 팀 정보 (0:토끼, 1:곰, 2:개구리, 3:펭귄)
const TEAMS = ["🐰 토끼팀", "🐻 곰팀", "🐸 개구리팀", "🐧 펭귄팀"];

io.on('connection', (socket) => {
  console.log('클라이언트 접속:', socket.id);

  // 1. 방 생성 (진행자)
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
    socket.emit('ROOM_CREATED', { roomCode });
  });

  // 2. 참가자 방 입장
  socket.on('PLAYER_JOIN', ({ roomCode, name, team }) => {
    const room = rooms[roomCode];
    if (!room) {
      return socket.emit('ERROR_MSG', '존재하지 않는 방 코드입니다.');
    }
    room.players[socket.id] = { name, team };
    room.scores[socket.id] = 0;
    socket.join(roomCode);
    socket.roomCode = roomCode;

    // 진행자와 전체 방 인원에게 갱신 알림
    io.to(roomCode).emit('STATE_UPDATE', room);
    socket.emit('JOIN_SUCCESS', { roomCode, name, team });
  });

  // 3. 게임 시작 (진행자)
  socket.on('HOST_START_GAME', ({ roomCode, gKey, duration }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;

    room.g = gKey;
    room.scores = {};
    room.ph = "count";
    room.n = 3;

    io.to(roomCode).emit('STATE_UPDATE', room);

    let countTimer = setInterval(() => {
      room.n--;
      if (room.n <= 0) {
        clearInterval(countTimer);
        room.ph = "play";
        room.left = duration;
        io.to(roomCode).emit('STATE_UPDATE', room);

        let playTimer = setInterval(() => {
          room.left--;
          if (room.left < 0) {
            clearInterval(playTimer);
            room.ph = "result";
            room.played++;
            io.to(roomCode).emit('STATE_UPDATE', room);
          } else {
            io.to(roomCode).emit('STATE_UPDATE', room);
          }
        }, 1000);
      } else {
        io.to(roomCode).emit('STATE_UPDATE', room);
      }
    }, 1000);
  });

  // 4. 실시간 점수 전송 (참가자)
  socket.on('PLAYER_SCORE', ({ val }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];

    room.scores[socket.id] = val;
    // 진행자에게 실시간 점수 수신 알림
    io.to(room.hostId).emit('LIVE_SCORE_UPDATE', { scores: room.scores });
  });

  // 5. 접속 해제 처리
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
  console.log(`게임 서버가 포트 ${PORT}에서 실행 중입니다.`);
});