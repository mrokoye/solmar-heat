// All sound is synthesised with WebAudio — no audio files, no network.
// Engine hum, gunshots, sirens, pickup chimes and a simple bass loop.

export function createSoundFX() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let enabled = true;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, duration, type, volume, slideTo) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    setEnabled(value) {
      enabled = value;
      if (master) master.gain.value = value ? 0.35 : 0;
    },
    shoot() {
      if (!ensure() || !enabled) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.16);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, t);
      filter.frequency.exponentialRampToValueAtTime(300, t + 0.14);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
    },
    enemyShoot() {
      blip(180, 0.12, 'square', 0.12, 90);
    },
    hit() {
      blip(320, 0.08, 'triangle', 0.25, 160);
    },
    crash() {
      if (!ensure() || !enabled) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.3);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
    },
    pickup() {
      blip(660, 0.1, 'sine', 0.3);
      setTimeout(() => blip(990, 0.14, 'sine', 0.3), 90);
    },
    missionComplete() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.3), i * 110));
    },
    busted() {
      blip(220, 0.5, 'sawtooth', 0.25, 110);
    },
    siren(distance) {
      // A short two-tone wail; call about once a second from police updates.
      if (!ensure() || !enabled) return;
      const volume = Math.max(0.02, Math.min(0.22, 30 / Math.max(8, distance)));
      blip(700, 0.35, 'sine', volume, 950);
      setTimeout(() => blip(950, 0.35, 'sine', volume, 700), 380);
    },
    startEngine() {
      if (!ensure() || !enabled) return;
      if (engineOsc) return;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.05;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    },
    setEngine(speed, maxSpeed) {
      if (engineOsc && ctx) {
        engineOsc.frequency.value = 50 + (speed / maxSpeed) * 90;
        engineGain.gain.value = 0.04 + (speed / maxSpeed) * 0.05;
      }
    },
    stopEngine() {
      if (engineOsc) {
        try { engineOsc.stop(); } catch { /* already stopped */ }
        engineOsc = null;
        engineGain = null;
      }
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      // A laid-back synth bass line in A minor, Solmar nights.
      const bass = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 61.74, 0, 73.42, 0];
      musicTimer = setInterval(() => {
        if (!enabled) return;
        const note = bass[musicStep % bass.length];
        musicStep += 1;
        if (note) blip(note, 0.32, 'triangle', 0.14);
        if (musicStep % 4 === 0) blip(220, 0.08, 'sine', 0.05);
      }, 240);
    },
    stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
}
