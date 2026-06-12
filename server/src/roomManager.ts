export interface Player {
  id: string; // Socket ID
  username: string;
  secretCode: string | null; // The secret code this player thinks of (which the opponent must guess)
  guesses: GuessAttempt[];    // The guesses this player has made (against the opponent's secret code)
  hasSetCode: boolean;
}

export interface GuessAttempt {
  guess: string;
  clues: {
    correctPosition: number; // ✅ Correct digit, correct position
    wrongPosition: number;   // 🔄 Correct digit, wrong position
    incorrect: number;       // ❌ Incorrect digit
  };
  timestamp: number;
}

export interface Room {
  id: string; // 4-character room code
  players: Player[];
  gameState: 'waiting' | 'setting_code' | 'playing' | 'game_over';
  turnPlayerId: string | null; // Socket ID of the player whose turn it is to guess
  turnDeadline: number | null; // Unix timestamp (ms) when current turn expires
  winnerUsername: string | null;
  winnerCode: string | null;    // The secret code that was cracked
  settings: {
    codeLength: number;
    allowDuplicates: boolean;
    turnTimeLimit: number; // seconds per turn
  };
}

const rooms = new Map<string, Room>();

// Helper to generate a random room ID
function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(id) ? generateRoomId() : id;
}

// Evaluate secret code vs guess
export function evaluateGuess(secret: string, guess: string) {
  let correctPosition = 0;
  let wrongPosition = 0;
  let incorrect = 0;

  for (let i = 0; i < guess.length; i++) {
    const digit = guess[i];
    if (secret[i] === digit) {
      correctPosition++;
    } else if (secret.includes(digit)) {
      wrongPosition++;
    } else {
      incorrect++;
    }
  }

  return { correctPosition, wrongPosition, incorrect };
}

// Validate that a code contains exactly N unique digits and only 0-9
export function validateCode(code: string, length = 4, allowDuplicates = false): boolean {
  if (code.length !== length) return false;
  if (!/^\d+$/.test(code)) return false;
  if (!allowDuplicates) {
    const uniqueDigits = new Set(code);
    if (uniqueDigits.size !== length) return false;
  }
  return true;
}

export const RoomManager = {
  createRoom(creatorUsername: string, creatorSocketId: string): Room {
    const roomId = generateRoomId();
    const creator: Player = {
      id: creatorSocketId,
      username: creatorUsername,
      secretCode: null,
      guesses: [],
      hasSetCode: false
    };

    const newRoom: Room = {
      id: roomId,
      players: [creator],
      gameState: 'waiting',
      turnPlayerId: null,
      turnDeadline: null,
      winnerUsername: null,
      winnerCode: null,
      settings: {
        codeLength: 4,
        allowDuplicates: false,
        turnTimeLimit: 45
      }
    };

    rooms.set(roomId, newRoom);
    return newRoom;
  },

  joinRoom(roomId: string, username: string, socketId: string): Room | null {
    const room = rooms.get(roomId.toUpperCase());
    if (!room) return null;

    // If a player with the same username already exists, update their socket ID (handles reconnects/refreshes)
    const existingPlayer = room.players.find(
      p => p.username.toLowerCase() === username.toLowerCase()
    );
    if (existingPlayer) {
      existingPlayer.id = socketId;
      // If we reconnected, ensure the turn is maintained or updated if needed
      return room;
    }

    // Prevent joining if room is already full (max 2 players for PvP duel)
    if (room.players.length >= 2) return null;

    const player: Player = {
      id: socketId,
      username,
      secretCode: null,
      guesses: [],
      hasSetCode: false
    };
    
    room.players.push(player);

    if (room.gameState === 'waiting' && room.players.length === 2) {
      room.gameState = 'setting_code';
    }

    return room;
  },

  setSecretCode(roomId: string, code: string, playerId: string): { room: Room | null; error: string | null } {
    const room = rooms.get(roomId);
    if (!room) return { room: null, error: 'Room not found' };

    if (room.gameState !== 'setting_code') {
      return { room, error: 'Cannot set code right now' };
    }

    const player = room.players.find(p => p.id === playerId);
    if (!player) {
      return { room, error: 'Player not found in room' };
    }

    if (!validateCode(code, room.settings.codeLength, room.settings.allowDuplicates)) {
      return { room, error: `Code must be exactly ${room.settings.codeLength} unique digits (0-9).` };
    }

    player.secretCode = code;
    player.hasSetCode = true;

    // Check if both players have set their codes
    const bothReady = room.players.length === 2 && room.players.every(p => p.hasSetCode);
    if (bothReady) {
      room.gameState = 'playing';
      // First player (creator) starts the guessing turn
      room.turnPlayerId = room.players[0].id;
      room.turnDeadline = Date.now() + room.settings.turnTimeLimit * 1000;
    }

    return { room, error: null };
  },

  submitGuess(roomId: string, guess: string, playerId: string): { room: Room | null; error: string | null } {
    const room = rooms.get(roomId);
    if (!room) return { room: null, error: 'Room not found' };

    if (room.gameState !== 'playing') {
      return { room, error: 'Game is not in playing state' };
    }

    if (room.turnPlayerId !== playerId) {
      return { room, error: "Wait for your turn! It's your opponent's turn to guess." };
    }

    const guesser = room.players.find(p => p.id === playerId);
    const opponent = room.players.find(p => p.id !== playerId);

    if (!guesser || !opponent) {
      return { room, error: 'Players not synchronized' };
    }

    if (!opponent.secretCode) {
      return { room, error: 'Opponent secret code is missing' };
    }

    if (!validateCode(guess, room.settings.codeLength, room.settings.allowDuplicates)) {
      return { room, error: `Guess must be exactly ${room.settings.codeLength} unique digits (0-9).` };
    }

    // Evaluate guess against opponent's code
    const clues = evaluateGuess(opponent.secretCode, guess);
    const attempt: GuessAttempt = {
      guess,
      clues,
      timestamp: Date.now()
    };

    guesser.guesses.push(attempt);

    // Check win condition
    if (clues.correctPosition === room.settings.codeLength) {
      room.gameState = 'game_over';
      room.winnerUsername = guesser.username;
      room.winnerCode = opponent.secretCode;
    } else {
      // Switch turns
      room.turnPlayerId = opponent.id;
      room.turnDeadline = Date.now() + room.settings.turnTimeLimit * 1000;
    }

    return { room, error: null };
  },

  restartRoom(roomId: string): Room | null {
    const room = rooms.get(roomId);
    if (!room) return null;

    // Reset game states
    room.players.forEach(p => {
      p.secretCode = null;
      p.guesses = [];
      p.hasSetCode = false;
    });

    room.gameState = room.players.length === 2 ? 'setting_code' : 'waiting';
    room.turnPlayerId = null;
    room.turnDeadline = null;
    room.winnerUsername = null;
    room.winnerCode = null;

    // Shuffle turn order so the loser starts, or just alternate
    // For simplicity, let the second player (joiner) start setting code/guessing this time!
    room.players.reverse(); 

    return room;
  },

  removePlayer(playerId: string): { room: Room | null; roomId: string | null } {
    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);

        // Reset game state if players are fewer than 2
        room.gameState = 'waiting';
        room.turnPlayerId = null;
        room.turnDeadline = null;
        room.winnerUsername = null;
        room.winnerCode = null;
        
        room.players.forEach(p => {
          p.secretCode = null;
          p.guesses = [];
          p.hasSetCode = false;
        });

        // If room is empty, delete it
        if (room.players.length === 0) {
          rooms.delete(roomId);
          return { room: null, roomId: null };
        }

        return { room, roomId };
      }
    }
    return { room: null, roomId: null };
  },

  // Get all rooms where the turn timer has expired
  getExpiredTurnRooms(): { roomId: string; room: Room }[] {
    const expired: { roomId: string; room: Room }[] = [];
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      if (
        room.gameState === 'playing' &&
        room.turnDeadline &&
        now >= room.turnDeadline &&
        room.turnPlayerId
      ) {
        expired.push({ roomId, room });
      }
    }
    return expired;
  },

  // Auto-skip the current player's turn (timer ran out)
  expireTurn(roomId: string): Room | null {
    const room = rooms.get(roomId);
    if (!room || room.gameState !== 'playing' || !room.turnPlayerId) return null;

    const currentPlayer = room.players.find(p => p.id === room.turnPlayerId);
    const opponent = room.players.find(p => p.id !== room.turnPlayerId);

    if (!currentPlayer || !opponent) return null;

    // Switch turn to opponent with fresh timer
    room.turnPlayerId = opponent.id;
    room.turnDeadline = Date.now() + room.settings.turnTimeLimit * 1000;

    return room;
  },

  getRoom(roomId: string): Room | null {
    return rooms.get(roomId.toUpperCase()) || null;
  }
};
