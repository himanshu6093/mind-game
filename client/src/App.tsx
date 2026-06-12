import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Play, Plus, Key, RefreshCw, Copy, 
  LogOut, HelpCircle, User, Hash, Users, 
  Settings, ChevronDown, ChevronUp
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playKeyClick, playErrorBuzzer, playTurnSwitch, playWinChime } from './audio';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3002`;

interface Player {
  id: string;
  username: string;
  secretCode: string | null;
  guesses: GuessAttempt[];
  hasSetCode: boolean;
}

interface GuessAttempt {
  guess: string;
  clues: {
    correctPosition: number;
    wrongPosition: number;
    incorrect: number;
  };
  timestamp: number;
}

interface Room {
  id: string;
  players: Player[];
  gameState: 'waiting' | 'setting_code' | 'playing' | 'game_over';
  turnPlayerId: string | null;
  turnDeadline: number | null;
  winnerUsername: string | null;
  winnerCode: string | null;
  settings: {
    codeLength: number;
    allowDuplicates: boolean;
    turnTimeLimit: number;
  };
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  
  // Input fields
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [roomIdInput, setRoomIdInput] = useState('');
  
  // Game state
  const [room, setRoom] = useState<Room | null>(null);
  const [activeCode, setActiveCode] = useState('');
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'mine' | 'opponent'>('mine');
  const [gameOverTab, setGameOverTab] = useState<'mine' | 'opponent'>('mine');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [opponentTyping, setOpponentTyping] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);

  // Custom Game Settings
  const [showSettings, setShowSettings] = useState(false);
  const [customLength, setCustomLength] = useState<number>(4);
  const [allowDuplicates, setAllowDuplicates] = useState<boolean>(false);
  
  // UI Helpers
  const toastTimeoutRef = useRef<number | null>(null);
  
  // Initialize WebSocket connection
  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);

    s.on('connect', () => {
      setConnected(true);
      console.log('Connected to socket server');
      
      // Auto-rejoin if we have an active room and username in this browser tab
      const savedRoomId = sessionStorage.getItem('currentRoomId');
      const savedUsername = localStorage.getItem('username');
      if (savedRoomId && savedUsername) {
        s.emit('join-room', { roomId: savedRoomId, username: savedUsername });
      }
    });

    s.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from socket server');
    });

    s.on('room-created', (updatedRoom: Room) => {
      setRoom(updatedRoom);
      setActiveCode('');
      sessionStorage.setItem('currentRoomId', updatedRoom.id);
    });

    s.on('room-updated', (updatedRoom: Room) => {
      setRoom(updatedRoom);
      sessionStorage.setItem('currentRoomId', updatedRoom.id);
      
      // If we transition to setting_code, playing, or reset, clear active inputs and tabs
      if (updatedRoom.gameState === 'setting_code' || updatedRoom.gameState === 'waiting') {
        setActiveCode('');
        setMobileTab('mine');
      }
    });

    s.on('error-msg', (msg: string) => {
      showToast(msg);
      triggerShake();
    });

    s.on('turn-expired', ({ message }: { message: string }) => {
      showToast(message);
    });

    s.on('opponent-typing', () => {
      setOpponentTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => setOpponentTyping(false), 2000);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Save username to localstorage
  const handleUsernameChange = (val: string) => {
    setUsername(val);
    localStorage.setItem('username', val);
  };

  // Toast helper
  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Helper variables (lookup by name for resilience against socket ID changes on disconnect/reconnect)
  const myPlayer = room?.players.find(p => p.username.toLowerCase() === username.toLowerCase());
  const opponent = room?.players.find(p => p.username.toLowerCase() !== username.toLowerCase());
  const isMyTurn = room?.turnPlayerId === myPlayer?.id;

  useEffect(() => {
    if (room?.gameState === 'game_over' && room.winnerUsername) {
      setGameOverTab('mine');
      if (room.winnerUsername === myPlayer?.username) {
        playWinChime();
        triggerConfetti();
      }
    }
  }, [room?.gameState, room?.winnerUsername, myPlayer?.username]);

  useEffect(() => {
    if (room?.gameState === 'playing' && room?.turnPlayerId === myPlayer?.id) {
      playTurnSwitch();
    }
  }, [room?.turnPlayerId, room?.gameState, myPlayer?.id]);

  const triggerConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  const triggerShake = () => {
    setShake(true);
    playErrorBuzzer();
    setTimeout(() => setShake(false), 500);
  };

  const copyToClipboard = (text: string) => {
    // Try modern clipboard API first (works on HTTPS/localhost)
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
      return;
    }
    // Fallback for HTTP / LAN IP (phones on local network)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const copyRoomCode = () => {
    if (!room) return;
    copyToClipboard(room.id);
    showToast(`Room code ${room.id} copied! Share it with your friend.`);
  };

  // Read room code from URL params on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setRoomIdInput(roomParam.toUpperCase());
    }
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!room || room.gameState !== 'playing' || !room.turnDeadline) {
      setTimeLeft(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((room.turnDeadline! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    tick(); // initial
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [room?.turnDeadline, room?.gameState]);

  // Keyboard controls for digit typing
  useEffect(() => {
    if (!room) return;
    
    const myPlayer = room.players.find(p => p.username.toLowerCase() === username.toLowerCase());
    if (!myPlayer) return;

    // Only allow typing if:
    // 1. We are in setting_code state and have NOT set our code yet.
    // 2. We are in playing state and it IS our turn.
    const canType = 
      (room.gameState === 'setting_code' && !myPlayer.hasSetCode) ||
      (room.gameState === 'playing' && room.turnPlayerId === myPlayer.id);
      
    if (!canType) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        // Enforce no-duplicates rule if applicable
        if (!room.settings.allowDuplicates && activeCode.includes(e.key)) {
          showToast('Duplicate digits are not allowed!');
          triggerShake();
          return;
        }
        if (activeCode.length < room.settings.codeLength) {
          playKeyClick();
          setActiveCode(prev => prev + e.key);
          socket?.emit('player-typing', { roomId: room.id });
        } else {
          playErrorBuzzer();
        }
      } else if (e.key === 'Backspace') {
        playKeyClick();
        setActiveCode(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (activeCode.length === room.settings.codeLength) {
          submitCode();
        } else {
          showToast(`Please enter a ${room.settings.codeLength}-digit code`);
          triggerShake();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [room, activeCode, socket]);

  const createRoom = () => {
    if (!username.trim()) {
      showToast('Please enter your username first');
      triggerShake();
      return;
    }
    socket?.emit('create-room', { 
      username, 
      settings: { 
        codeLength: customLength, 
        allowDuplicates 
      } 
    });
  };

  const joinRoom = () => {
    if (!username.trim()) {
      showToast('Please enter your username first');
      triggerShake();
      return;
    }
    if (!roomIdInput.trim()) {
      showToast('Please enter a Room ID');
      triggerShake();
      return;
    }
    socket?.emit('join-room', { roomId: roomIdInput, username });
  };

  const submitCode = () => {
    if (!room) return;
    if (activeCode.length !== room.settings.codeLength) {
      showToast(`Code must be exactly ${room.settings.codeLength} digits`);
      triggerShake();
      return;
    }

    if (room.gameState === 'setting_code') {
      socket?.emit('set-secret-code', { roomId: room.id, code: activeCode });
      showToast('Your secret code is locked in! 🔒');
      setActiveCode('');
    } else if (room.gameState === 'playing') {
      socket?.emit('submit-guess', { roomId: room.id, guess: activeCode });
      setActiveCode('');
    }
  };

  const autoGenerateCode = () => {
    if (!room) return;
    const len = room.settings.codeLength;
    const allowDup = room.settings.allowDuplicates;
    const digits = ['0','1','2','3','4','5','6','7','8','9'];
    let generated = '';
    
    while (generated.length < len) {
      const idx = Math.floor(Math.random() * digits.length);
      const digit = allowDup ? digits[idx] : digits.splice(idx, 1)[0];
      generated += digit;
    }
    setActiveCode(generated);
    showToast(`Random ${len}-digit code generated!`);
  };

  const handleKeypadPress = (digit: string) => {
    if (!room) return;
    if (!room.settings.allowDuplicates && activeCode.includes(digit)) {
      showToast('Duplicate digits are not allowed!');
      triggerShake();
      return;
    }
    if (activeCode.length < room.settings.codeLength) {
      playKeyClick();
      setActiveCode(prev => prev + digit);
      socket?.emit('player-typing', { roomId: room.id });
    } else {
      playErrorBuzzer();
    }
  };

  const handleKeypadDelete = () => {
    playKeyClick();
    setActiveCode(prev => prev.slice(0, -1));
  };

  const leaveRoom = () => {
    sessionStorage.removeItem('currentRoomId');
    window.location.reload();
  };

  const restartGame = () => {
    if (!room) return;
    socket?.emit('restart-game', { roomId: room.id });
    showToast('rematch started! Choose new codes.');
  };



  // LOBBY VIEW
  if (!room) {
    return (
      <div className="glass-container pulse-primary">
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '38px', background: 'linear-gradient(to right, #c084fc, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' }}>
            MIND GAME
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            PvP Codebreaking Duel. Choose a secret code, crack your opponent's.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
            YOUR PLAYER NAME
          </label>
          <div style={{ position: 'relative' }}>
            <User size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              placeholder="e.g., CodeBreaker"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              style={{ paddingLeft: '44px', textAlign: 'left' }}
              maxLength={14}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createRoom();
              }}
            />
          </div>

          {/* Advanced Settings Toggle */}
          <div style={{ marginTop: '4px' }}>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', margin: '0 auto' }}
            >
              <Settings size={14} /> Advanced Room Settings {showSettings ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
            
            {showSettings && (
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>CODE LENGTH</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[4, 5, 6].map(len => (
                      <button 
                        key={len}
                        onClick={() => setCustomLength(len)}
                        style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${customLength === len ? 'var(--color-primary)' : 'var(--border-color)'}`, background: customLength === len ? 'rgba(128, 14, 19, 0.2)' : 'transparent', color: customLength === len ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
                      >
                        {len} Digits
                      </button>
                    ))}
                  </div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>ALLOW DUPLICATES</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>e.g. 1122 is valid</span>
                  </div>
                  <button 
                    onClick={() => setAllowDuplicates(!allowDuplicates)}
                    style={{ width: '44px', height: '24px', borderRadius: '12px', background: allowDuplicates ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)', border: 'none', position: 'relative', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  >
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'white', position: 'absolute', top: '3px', left: allowDuplicates ? '23px' : '3px', transition: 'all 0.2s ease' }} />
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <button className="btn-primary" onClick={createRoom} style={{ marginTop: '8px' }}>
            <Plus size={20} /> Create New Room
          </button>

          <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0' }}>
            <hr style={{ flex: 1, borderColor: 'var(--border-color)' }} />
            <span style={{ padding: '0 12px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>OR JOIN ROOM</span>
            <hr style={{ flex: 1, borderColor: 'var(--border-color)' }} />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Enter Room Code (e.g. A3FX)"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
              style={{ textTransform: 'uppercase', fontFamily: 'var(--font-display)', letterSpacing: '0.05em', fontWeight: 600 }}
            />
            <button className="btn-secondary" onClick={joinRoom} style={{ width: 'auto', padding: '0 24px' }}>
              <Play size={18} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <HelpCircle size={14} />
          <span>✅ Correct position | 🔄 Wrong position | ❌ Wrong digit</span>
        </div>

        {!connected && (
          <div style={{ fontSize: '11px', color: 'var(--color-wrong)', textAlign: 'center', marginTop: '-12px' }}>
            ⚠️ Connecting to game server...
          </div>
        )}
        {toast && <div className="toast-msg">{toast}</div>}
      </div>
    );
  }

  // ROOM SCREEN
  return (
    <>
      <div className={`glass-container ${shake ? 'shake' : ''}`} style={{ maxWidth: '680px', width: '100%', marginTop: '30px' }}>
        {/* Header Info */}
      <div className="room-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>ROOM CODE</span>
          <button className="room-badge" onClick={copyRoomCode} style={{ display: 'flex', alignItems: 'center', gap: '6px', border: 'none', background: 'rgba(6, 182, 212, 0.1)' }}>
            <Hash size={14} />
            {room.id}
            <Copy size={12} />
          </button>
        </div>

        <div className="status-indicator">
          <div className={`status-dot ${room.players.length >= 2 ? 'active' : ''}`} />
          <span>{room.players.length === 1 ? 'Waiting for opponent...' : 'PvP Match Ready'}</span>
        </div>

        <div>
          <button onClick={leaveRoom} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
            <LogOut size={16} /> Exit
          </button>
        </div>
      </div>

      {/* Players view */}
      <div style={{ display: 'flex', gap: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: '16px', padding: '12px 18px', alignItems: 'center' }}>
        <Users size={16} style={{ color: 'var(--text-muted)' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '13px' }}>
          {room.players.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: p.id === socket?.id ? 'white' : 'var(--text-muted)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: p.id === socket?.id ? 'var(--color-primary)' : 'var(--color-secondary)' }} />
              <span style={{ fontWeight: p.id === socket?.id ? 600 : 400 }}>
                {p.username} {p.id === socket?.id && '(You)'}
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                {p.hasSetCode ? 'Locked In 🔒' : 'Thinking... ⏳'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* GAME STATE - WAITING FOR OPPONENT */}
      {room.gameState === 'waiting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', padding: '30px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '48px' }}>🤝</div>
          <h2>Waiting for a friend to join...</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '340px' }}>
            Share this room code with your friend:
          </p>
          <div 
            onClick={copyRoomCode}
            style={{ 
              fontSize: '32px', 
              fontWeight: '800', 
              color: 'var(--color-secondary)', 
              background: 'rgba(6, 182, 212, 0.1)', 
              border: '1px solid var(--color-secondary)',
              borderRadius: '16px',
              padding: '12px 28px',
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              margin: '8px 0',
              textShadow: '0 0 10px rgba(6, 182, 212, 0.2)'
            }}
          >
            Code: {room.id}
            <Copy size={20} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '340px' }}>
            Or they can join directly by clicking the link:
          </p>
          <input 
            type="text" 
            className="input-field" 
            readOnly 
            value={`${window.location.origin}/?room=${room.id}`}
            onClick={(e) => {
              (e.target as HTMLInputElement).select();
              copyRoomCode();
            }}
            style={{ textAlign: 'center', fontSize: '13px', cursor: 'pointer', background: 'rgba(0,0,0,0.4)', borderColor: 'var(--border-color)' }}
          />
          <button className="btn-secondary" onClick={copyRoomCode}>
            Copy Direct Link
          </button>
        </div>
      )}

      {/* GAME STATE - SETTING CODES */}
      {room.gameState === 'setting_code' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '10px 0' }}>
          {myPlayer && !myPlayer.hasSetCode ? (
            <>
              <div style={{ textAlign: 'center' }}>
                <h2>Choose Your Secret Code</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
                  Choose {room.settings.codeLength} {room.settings.allowDuplicates ? '' : 'unique '}digits. Opponent will try to guess this code.
                </p>
              </div>

              {/* Digit View */}
              <div className="digits-container">
              {Array.from({ length: room.settings.codeLength }).map((_, idx) => (
                <div 
                  key={idx} 
                  className={`digit-box ${idx === activeCode.length ? 'active' : ''} ${activeCode[idx] !== undefined ? 'filled' : ''}`}
                >
                  {activeCode[idx] !== undefined ? activeCode[idx] : ''}
                </div>
              ))}
            </div>

              {/* Interactive Keypad */}
              <div className="keypad-grid">
                {['0','1','2','3','4','5','6','7','8','9'].map((d) => (
                  <button 
                    key={d} 
                  className="keypad-btn"
                  disabled={!room.settings.allowDuplicates && activeCode.includes(d)}
                  onClick={() => handleKeypadPress(d)}
                  >
                    {d}
                  </button>
                ))}
                <button 
                  className="keypad-btn" 
                  style={{ gridColumn: 'span 2', fontSize: '14px', color: 'var(--color-wrong)' }} 
                  onClick={handleKeypadDelete}
                  disabled={activeCode.length === 0}
                >
                  Delete
                </button>
                <button 
                  className="keypad-btn" 
                  style={{ gridColumn: 'span 3', fontSize: '14px', color: 'var(--color-secondary)' }}
                  onClick={autoGenerateCode}
                >
                  Auto-Gen
                </button>
              </div>

              <button className="btn-primary" onClick={submitCode} disabled={activeCode.length !== room.settings.codeLength}>
                <Key size={18} /> Lock In Code
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', padding: '30px 0', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', animation: 'pulse-dot 1.5s infinite' }}>🔒</div>
              <h2>Your Code is Locked In!</h2>
              <div style={{ fontSize: '24px', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-secondary)', letterSpacing: '0.2em', paddingLeft: '0.2em' }}>
                {myPlayer?.secretCode}
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: opponent?.hasSetCode ? 'var(--color-correct)' : 'var(--color-partial)' }} />
                <span>
                  {opponent?.hasSetCode 
                    ? `${opponent.username} has locked in their code too! Starting...` 
                    : `Waiting for ${opponent?.username} to set their secret code...`
                  }
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GAME STATE - PLAYING (DUEL) */}
      {room.gameState === 'playing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Turn Indicator Banner */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            background: isMyTurn ? 'rgba(139, 92, 246, 0.1)' : 'rgba(0, 0, 0, 0.2)',
            border: `1px solid ${isMyTurn ? 'var(--color-primary)' : 'var(--border-color)'}`,
            borderRadius: '16px', 
            padding: '16px 20px'
          }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                ACTIVE GAME TURN
              </span>
              <h2 style={{ fontSize: '20px', marginTop: '4px', color: isMyTurn ? 'white' : 'var(--text-muted)' }}>
                {isMyTurn 
                  ? '👉 Your Turn!' 
                  : <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      ⏳ {opponent?.username}... 
                      {opponentTyping && <span className="typing-indicator" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-correct)', animation: 'pulse-dot 1s infinite' }} />}
                    </span>
                }
              </h2>
            </div>
            
            {/* Timer */}
            {timeLeft !== null && (
              <div className={`turn-timer ${timeLeft <= 10 ? 'danger' : ''}`}>
                <span className="timer-value">{timeLeft}</span>
                <span className="timer-label">sec</span>
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>YOUR CODE</span>
              <span style={{ fontSize: '18px', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-secondary)', letterSpacing: '0.1em' }}>
                {myPlayer?.secretCode}
              </span>
            </div>
          </div>

          {/* Active Guesser Keypad (Only visible if it is my turn) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: isMyTurn ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.3)', opacity: isMyTurn ? 1 : 0.6, borderRadius: '20px', padding: '20px', border: isMyTurn ? '1px dashed rgba(255,255,255,0.15)' : '1px solid transparent', transition: 'all 0.3s ease' }}>
            <h3 style={{ fontSize: '16px', textAlign: 'center', color: 'white' }}>
              {isMyTurn 
                ? "Guess Opponent's Secret Code" 
                : <span>Opponent is choosing their guess {opponentTyping && <span style={{ color: 'var(--color-primary)', marginLeft: '8px', fontSize: '12px', animation: 'pulse-dot 1s infinite' }}>Typing...</span>}</span>
              }
            </h3>
            
            <div className="digits-container">
              {Array.from({ length: room.settings.codeLength }).map((_, idx) => (
                <div 
                  key={idx} 
                  className={`digit-box ${isMyTurn && idx === activeCode.length ? 'active' : ''} ${activeCode[idx] !== undefined ? 'filled' : ''}`}
                >
                  {activeCode[idx] !== undefined ? activeCode[idx] : ''}
                </div>
              ))}
            </div>

            <div className="keypad-grid">
              {['0','1','2','3','4','5','6','7','8','9'].map((d) => (
                <button 
                  key={d} 
                  className="keypad-btn"
                  disabled={!isMyTurn || (!room.settings.allowDuplicates && activeCode.includes(d))}
                  onClick={() => handleKeypadPress(d)}
                >
                  {d}
                </button>
              ))}
              <button 
                className="keypad-btn" 
                style={{ gridColumn: 'span 2', fontSize: '14px', color: 'var(--color-wrong)' }} 
                onClick={handleKeypadDelete}
                disabled={!isMyTurn || activeCode.length === 0}
              >
                Delete
              </button>
              <button 
                className="keypad-btn" 
                style={{ gridColumn: 'span 3', fontSize: '14px', color: 'var(--color-correct)' }}
                onClick={submitCode}
                disabled={!isMyTurn || activeCode.length !== 4}
              >
                Submit Guess
              </button>
            </div>
          </div>

          {/* Mobile Tab Switcher */}
          <div className="mobile-history-tabs">
            <button 
              className={`tab-btn ${mobileTab === 'mine' ? 'active' : ''}`}
              onClick={() => setMobileTab('mine')}
            >
              Your Guesses ({myPlayer?.guesses.length})
            </button>
            <button 
              className={`tab-btn ${mobileTab === 'opponent' ? 'active' : ''}`}
              onClick={() => setMobileTab('opponent')}
            >
              {opponent?.username}'s ({opponent?.guesses.length})
            </button>
          </div>

          {/* Guess History Logs - SIDE BY SIDE FOR DESKTOP / TABBED FOR MOBILE */}
          <div className="history-duel-grid">
            {/* Left side: My guesses */}
            <div className={`history-column ${mobileTab !== 'mine' ? 'mobile-hidden' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 className="desktop-history-title" style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your Guesses ({myPlayer?.guesses.length})
              </h3>
              <div className="history-container" style={{ maxHeight: '200px' }}>
                {myPlayer?.guesses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px', background: 'rgba(0,0,0,0.1)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                    No guesses made yet.
                  </div>
                ) : (
                  myPlayer?.guesses.map((item, idx) => (
                    <div key={idx} className="history-item" style={{ padding: '8px 12px', borderRadius: '12px', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>#{idx + 1}</span>
                      <span style={{ fontSize: '16px', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'white' }}>{item.guess}</span>
                      <div className="clues-row" style={{ gap: '4px' }}>
                        <span style={{ color: 'var(--color-correct)', fontSize: '11px' }}>✅{item.clues.correctPosition}</span>
                        <span style={{ color: 'var(--color-partial)', fontSize: '11px' }}>🔄{item.clues.wrongPosition}</span>
                      </div>
                    </div>
                  )).reverse()
                )}
              </div>
            </div>

            {/* Right side: Opponent guesses */}
            <div className={`history-column ${mobileTab !== 'opponent' ? 'mobile-hidden' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 className="desktop-history-title" style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {opponent?.username}'s Guesses ({opponent?.guesses.length})
              </h3>
              <div className="history-container" style={{ maxHeight: '200px' }}>
                {opponent?.guesses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px', background: 'rgba(0,0,0,0.1)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                    No guesses made yet.
                  </div>
                ) : (
                  opponent?.guesses.map((item, idx) => (
                    <div key={idx} className="history-item" style={{ padding: '8px 12px', borderRadius: '12px', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>#{idx + 1}</span>
                      <span style={{ fontSize: '16px', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'white' }}>{item.guess}</span>
                      <div className="clues-row" style={{ gap: '4px' }}>
                        <span style={{ color: 'var(--color-correct)', fontSize: '11px' }}>✅{item.clues.correctPosition}</span>
                        <span style={{ color: 'var(--color-partial)', fontSize: '11px' }}>🔄{item.clues.wrongPosition}</span>
                      </div>
                    </div>
                  )).reverse()
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GAME STATE - GAME OVER */}
      {room.gameState === 'game_over' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', padding: '20px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '64px' }}>🏆</div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              DUEL RESOLVED!
            </span>
            <h2 style={{ fontSize: '28px', marginTop: '6px' }}>
              {room.winnerUsername} Wins!
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
              Cracked the opponent's code successfully first!
            </p>
          </div>

          <div style={{ display: 'flex', gap: '16px', width: '100%', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 24px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)', borderRadius: '16px', flex: 1, maxWidth: '240px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>YOUR CODE</span>
              <span style={{ fontSize: '24px', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '0.1em' }}>
                {myPlayer?.secretCode}
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 24px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)', borderRadius: '16px', flex: 1, maxWidth: '240px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{opponent?.username}'S CODE</span>
              <span style={{ fontSize: '24px', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-secondary)', letterSpacing: '0.1em' }}>
                {opponent?.secretCode}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            <button className="btn-primary" onClick={restartGame}>
              <RefreshCw size={18} /> Rematch (Alternate Order)
            </button>
            <button className="btn-secondary" onClick={leaveRoom}>
              Back to Main Menu
            </button>
          </div>

          {/* Mobile Tab Switcher for Game Over */}
          <div className="mobile-history-tabs">
            <button 
              className={`tab-btn ${gameOverTab === 'mine' ? 'active' : ''}`}
              onClick={() => setGameOverTab('mine')}
            >
              Your Guesses ({myPlayer?.guesses.length})
            </button>
            <button 
              className={`tab-btn ${gameOverTab === 'opponent' ? 'active' : ''}`}
              onClick={() => setGameOverTab('opponent')}
            >
              {opponent?.username}'s ({opponent?.guesses.length})
            </button>
          </div>

          {/* Detailed Recaps */}
          <div className="history-duel-grid" style={{ width: '100%', borderTop: '1px solid var(--border-color)', paddingTop: '20px', textAlign: 'left' }}>
            <div className={`history-column ${gameOverTab !== 'mine' ? 'mobile-hidden' : ''}`}>
              <h3 className="desktop-history-title" style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>YOUR GUESS LOG</h3>
              <div className="history-container" style={{ maxHeight: '160px' }}>
                {myPlayer?.guesses.map((item, idx) => (
                  <div key={idx} className="history-item" style={{ padding: '6px 10px', borderRadius: '10px', fontSize: '12px' }}>
                    <span>#{idx+1} {item.guess}</span>
                    <span style={{ color: 'var(--text-muted)' }}>✅{item.clues.correctPosition} 🔄{item.clues.wrongPosition}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`history-column ${gameOverTab !== 'opponent' ? 'mobile-hidden' : ''}`}>
              <h3 className="desktop-history-title" style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>{opponent?.username}'S GUESS LOG</h3>
              <div className="history-container" style={{ maxHeight: '160px' }}>
                {opponent?.guesses.map((item, idx) => (
                  <div key={idx} className="history-item" style={{ padding: '6px 10px', borderRadius: '10px', fontSize: '12px' }}>
                    <span>#{idx+1} {item.guess}</span>
                    <span style={{ color: 'var(--text-muted)' }}>✅{item.clues.correctPosition} 🔄{item.clues.wrongPosition}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast-msg">{toast}</div>}
      </div>
    </>
  );
}

export default App;
