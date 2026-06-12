// Simple Synthesizer for Game Feel (Juice)

let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

// Play a short, satisfying "click/pop" sound for keypad presses
export const playKeyClick = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
    
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(10);
  } catch (e) {
    // Ignore audio errors (e.g. user hasn't interacted yet)
  }
};

// Play an error buzzer sound
export const playErrorBuzzer = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
  } catch (e) {}
};

// Play a chime when it becomes the player's turn
export const playTurnSwitch = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    
    if (navigator.vibrate) navigator.vibrate(20);
  } catch (e) {}
};

// Play a triumphant victory chord
export const playWinChime = () => {
  try {
    const ctx = getAudioContext();
    
    const playNote = (freq: number, startDelay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(0, ctx.currentTime + startDelay);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + startDelay + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startDelay + 1.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(ctx.currentTime + startDelay);
      osc.stop(ctx.currentTime + startDelay + 1.5);
    };
    
    // C Major Chord Arpeggio
    playNote(261.63, 0);    // C4
    playNote(329.63, 0.1);  // E4
    playNote(392.00, 0.2);  // G4
    playNote(523.25, 0.3);  // C5
    
    if (navigator.vibrate) navigator.vibrate([50, 100, 50, 100, 200]);
  } catch (e) {}
};
