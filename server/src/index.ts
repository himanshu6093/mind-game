import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './roomManager';

const app = express();
const port = process.env.PORT || 3002;

// Configure CORS
app.use(cors({
  origin: '*', // In production, replace with client's URL
  methods: ['GET', 'POST']
}));

// Basic status route
app.get('/status', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Create Room
  socket.on('create-room', ({ username }: { username: string }) => {
    if (!username || username.trim() === '') {
      socket.emit('error-msg', 'Username is required');
      return;
    }

    const room = RoomManager.createRoom(username.trim(), socket.id);
    socket.join(room.id);
    
    socket.emit('room-created', room);
    io.to(room.id).emit('room-updated', room);
    console.log(`Room created: ${room.id} by ${username}`);
  });

  // 2. Join Room
  socket.on('join-room', ({ roomId, username }: { roomId: string; username: string }) => {
    if (!roomId || roomId.trim() === '') {
      socket.emit('error-msg', 'Room ID is required');
      return;
    }
    if (!username || username.trim() === '') {
      socket.emit('error-msg', 'Username is required');
      return;
    }

    const cleanRoomId = roomId.trim().toUpperCase();
    const room = RoomManager.getRoom(cleanRoomId);

    if (!room) {
      socket.emit('error-msg', 'Room not found. Check the code and try again.');
      return;
    }

    const updatedRoom = RoomManager.joinRoom(cleanRoomId, username.trim(), socket.id);
    if (!updatedRoom) {
      socket.emit('error-msg', 'Failed to join room');
      return;
    }

    socket.join(cleanRoomId);
    io.to(cleanRoomId).emit('room-updated', updatedRoom);
    console.log(`User ${username} joined Room: ${cleanRoomId}`);
  });

  // 3. Set Secret Code (Creator sets code)
  socket.on('set-secret-code', ({ roomId, code }: { roomId: string; code: string }) => {
    const cleanRoomId = roomId.trim().toUpperCase();
    const { room, error } = RoomManager.setSecretCode(cleanRoomId, code, socket.id);

    if (error) {
      socket.emit('error-msg', error);
      return;
    }

    if (room) {
      io.to(cleanRoomId).emit('room-updated', room);
      console.log(`Secret code set for Room: ${cleanRoomId}`);
    }
  });

  // 4. Submit Guess (Guesser guesses code)
  socket.on('submit-guess', ({ roomId, guess }: { roomId: string; guess: string }) => {
    const cleanRoomId = roomId.trim().toUpperCase();
    const { room, error } = RoomManager.submitGuess(cleanRoomId, guess, socket.id);

    if (error) {
      socket.emit('error-msg', error);
      return;
    }

    if (room) {
      io.to(cleanRoomId).emit('room-updated', room);
      console.log(`Guess submitted in Room ${cleanRoomId}: ${guess}`);
    }
  });

  // 5. Restart Game (Rematch)
  socket.on('restart-game', ({ roomId }: { roomId: string }) => {
    const cleanRoomId = roomId.trim().toUpperCase();
    const room = RoomManager.restartRoom(cleanRoomId);

    if (room) {
      io.to(cleanRoomId).emit('room-updated', room);
      console.log(`Game restarted in Room ${cleanRoomId}`);
    }
  });

  // 6. Disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const { room, roomId } = RoomManager.removePlayer(socket.id);

    if (roomId && room) {
      io.to(roomId).emit('room-updated', room);
      console.log(`Player left. Room ${roomId} updated.`);
    }
  });
});

// Timer tick: check for expired turns every second
setInterval(() => {
  const expired = RoomManager.getExpiredTurnRooms();
  for (const { roomId } of expired) {
    const updatedRoom = RoomManager.expireTurn(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room-updated', updatedRoom);
      io.to(roomId).emit('turn-expired', { message: 'Time is up! Turn skipped.' });
      console.log(`Turn expired in Room ${roomId}, auto-switched.`);
    }
  }
}, 1000);

httpServer.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server listening on port ${port} (accessible on local network)`);
});
