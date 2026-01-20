/**
 * Typewriter Sound Service
 * Plays mechanical typewriter sounds for key presses
 */

// Audio context for generating sounds
let audioContext: AudioContext | null = null;
let warmupListenersAttached = false;

// Settings
let enabled = false;
let volume = 0.5; // 0-1

// Get or create AudioContext (and resume if suspended)
async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    console.log('[TypewriterSound] Created new AudioContext, state:', audioContext.state);
    audioContext.addEventListener('statechange', () => {
      if (audioContext && (audioContext.state === 'suspended' || audioContext.state === 'interrupted')) {
        audioContext.resume().catch(() => {});
      }
    });
  }
  if (audioContext.state === 'suspended' || (audioContext as any).state === 'interrupted') {
    console.log('[TypewriterSound] Resuming AudioContext, state:', audioContext.state);
    await audioContext.resume();
  }
  return audioContext;
}

// Attach a one-time warmup on user gesture (fixes browsers that require interaction)
function attachWarmupListeners() {
  if (warmupListenersAttached) return;
  warmupListenersAttached = true;
  const warmup = () => { ensureAudioContext(); cleanup(); };
  const cleanup = () => {
    document.removeEventListener('pointerdown', warmup, true);
    document.removeEventListener('keydown', warmup, true);
  };
  document.addEventListener('pointerdown', warmup, true);
  document.addEventListener('keydown', warmup, true);
}

// Generate a typewriter key click sound
async function playKeyClick() {
  if (!enabled || volume === 0) return;
  
  try {
    const ctx = await ensureAudioContext();
    const now = ctx.currentTime;
    
    // Create oscillator for the mechanical click
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    // Connect nodes
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Configure sound - short, sharp click
    osc.type = 'square';
    osc.frequency.setValueAtTime(1800 + Math.random() * 400, now); // Slight variation
    
    // High-pass filter for mechanical sound
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(2, now);
    
    // Very short envelope for click - louder
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume * 0.5, now + 0.001);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    
    // Play
    osc.start(now);
    osc.stop(now + 0.04);
  } catch (e) {
    console.error('Typewriter sound error:', e);
  }
}

// Generate a carriage return / line break sound
async function playCarriageReturn() {
  if (!enabled || volume === 0) return;
  
  const ctx = await ensureAudioContext();
  const now = ctx.currentTime;
  
  // Create oscillators for the mechanical slide sound
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  // Connect nodes
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Configure sound - sliding metallic sound
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(400, now);
  osc1.frequency.linearRampToValueAtTime(200, now + 0.15);
  
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(100, now);
  
  // Band-pass filter
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(600, now);
  filter.Q.setValueAtTime(1, now);
  
  // Envelope
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(volume * 0.2, now + 0.02);
  gainNode.gain.linearRampToValueAtTime(volume * 0.15, now + 0.1);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  
  // Play
  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.25);
  osc2.stop(now + 0.25);
}

// Generate a bell/ding sound (like end of line on old typewriters)
async function playBell() {
  if (!enabled || volume === 0) return;
  
  const ctx = await ensureAudioContext();
  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Bell-like tone
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2000, now);
  
  // Bell envelope - quick attack, longer decay
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(volume * 0.25, now + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  
  osc.start(now);
  osc.stop(now + 0.35);
}

// Public API
export const TypewriterSound = {
  /**
   * Enable/disable typewriter sounds
   * When enabling, also initialize the AudioContext
   */
  setEnabled(value: boolean) {
    console.log('[TypewriterSound] setEnabled:', value);
    enabled = value;
    if (value) {
      attachWarmupListeners();
      // Pre-initialize AudioContext when enabling
      void ensureAudioContext();
    }
  },
  
  /**
   * Set volume (0-100)
   */
  setVolume(value: number) {
    volume = Math.max(0, Math.min(100, value)) / 100;
    console.log('[TypewriterSound] setVolume:', value, '-> internal:', volume);
  },
  
  /**
   * Play sound for a regular key press
   */
  onKeyPress() {
    console.log('[TypewriterSound] onKeyPress, enabled:', enabled, 'volume:', volume);
    void playKeyClick();
  },
  
  /**
   * Play sound for Enter/Return key
   */
  onEnter() {
    console.log('[TypewriterSound] onEnter');
    void playCarriageReturn();
  },
  
  /**
   * Play bell sound (optional, for special events)
   */
  onBell() {
    void playBell();
  },
  
  /**
   * Check if sounds are enabled
   */
  isEnabled(): boolean {
    return enabled;
  }
};

export default TypewriterSound;
