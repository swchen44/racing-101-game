// audio.js — Web Audio 程序化音效:引擎、甩尾、碰撞、風切、環境、UI
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
  }

  // 必須在使用者手勢後呼叫
  start() {
    if (this.started) return;
    this.started = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // ---- 引擎:鋸齒波(主) + 方波(次階) + 低通 ----
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineFilter.Q.value = 2.5;
    const engine2Gain = ctx.createGain();
    engine2Gain.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(engine2Gain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // ---- 排氣噗噗聲 (帶通噪音) ----
    const noiseBuf = this._noiseBuffer(2);
    this.exhaustSrc = ctx.createBufferSource();
    this.exhaustSrc.buffer = noiseBuf;
    this.exhaustSrc.loop = true;
    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = 'bandpass';
    this.exhaustFilter.frequency.value = 120;
    this.exhaustFilter.Q.value = 1.2;
    this.exhaustGain = ctx.createGain();
    this.exhaustGain.gain.value = 0;
    this.exhaustSrc.connect(this.exhaustFilter).connect(this.exhaustGain).connect(this.master);
    this.exhaustSrc.start();

    // ---- 風切 ----
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = noiseBuf;
    this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 900;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.windSrc.start();

    // ---- 甩尾輪胎聲 (高頻帶通噪音) ----
    this.skidSrc = ctx.createBufferSource();
    this.skidSrc.buffer = noiseBuf;
    this.skidSrc.loop = true;
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1400;
    this.skidFilter.Q.value = 4;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidSrc.connect(this.skidFilter).connect(this.skidGain).connect(this.master);
    this.skidSrc.start();

    // ---- 城市環境 (極低音量棕噪 + 遠方低頻) ----
    const ambSrc = ctx.createBufferSource();
    ambSrc.buffer = this._brownNoiseBuffer(4);
    ambSrc.loop = true;
    const ambFilter = ctx.createBiquadFilter();
    ambFilter.type = 'lowpass';
    ambFilter.frequency.value = 260;
    const ambGain = ctx.createGain();
    ambGain.gain.value = 0.045;
    ambSrc.connect(ambFilter).connect(ambGain).connect(this.master);
    ambSrc.start();
  }

  _noiseBuffer(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _brownNoiseBuffer(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  update(car, dt, racing) {
    if (!this.started || !car) return;
    const t = this.ctx.currentTime;
    const speedRatio = Math.min(1, car.speedKmh / 220);
    // 模擬檔位:rpm 隨速度在各檔內爬升
    const gearCount = 6;
    const gearPos = (speedRatio * gearCount) % 1;
    const rpm = 0.25 + gearPos * 0.75;
    const throttleBoost = car.throttleSmooth * 0.3;

    const baseFreq = 55 + rpm * 260 + throttleBoost * 60;
    this.engineOsc.frequency.setTargetAtTime(baseFreq, t, 0.04);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 0.5 + 2, t, 0.04);
    this.engineFilter.frequency.setTargetAtTime(300 + rpm * 2400 + throttleBoost * 800, t, 0.06);
    const vol = racing ? (0.1 + speedRatio * 0.12 + car.throttleSmooth * 0.14) : 0.05;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);

    this.exhaustFilter.frequency.setTargetAtTime(80 + rpm * 160, t, 0.05);
    this.exhaustGain.gain.setTargetAtTime(car.throttleSmooth * 0.1 + speedRatio * 0.03, t, 0.1);

    this.windGain.gain.setTargetAtTime(speedRatio * speedRatio * 0.16, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + speedRatio * 2400, t, 0.15);

    const skidTarget = (car.drifting ? Math.min(0.16, car.driftAmount * 0.2) : 0);
    this.skidGain.gain.setTargetAtTime(skidTarget, t, 0.05);
    this.skidFilter.frequency.setTargetAtTime(1100 + car.driftAmount * 900, t, 0.05);
  }

  collision(strength) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.3);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.5, strength * 0.55), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    // 金屬鏗
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180 + Math.random() * 120, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    const og = ctx.createGain();
    og.gain.setValueAtTime(Math.min(0.3, strength * 0.35), t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(og).connect(this.master);
    osc.start(); osc.stop(t + 0.25);
  }

  beep(freq, dur, vol = 0.25, type = 'square') {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(); osc.stop(t + dur + 0.02);
  }

  countdownBeep() { this.beep(440, 0.22, 0.3); }
  goBeep() { this.beep(880, 0.5, 0.35); this.beep(1320, 0.4, 0.18, 'triangle'); }
  lapBeep() { this.beep(660, 0.12, 0.22); setTimeout(() => this.beep(990, 0.18, 0.22), 110); }
  recordBeep() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 0.22, 'triangle'), i * 90));
  }
  finishFanfare() {
    [523, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.22, 0.25, 'triangle'), i * 140));
  }
}
