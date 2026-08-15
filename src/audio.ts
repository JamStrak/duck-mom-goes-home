// 音效系统：Web Audio 程序化合成（零体积、无音频文件）。
// 包含 iOS 自动播放解锁（首次用户手势时 resume）与静音状态持久化。

export type SfxName =
  | "step"
  | "collect"
  | "reject"
  | "undo"
  | "reset"
  | "hint"
  | "win";

const MUTE_KEY = "duck_mom_muted";

class AudioManager {
  private ctx: AudioContext | null = null;
  private _muted = false;

  constructor() {
    try {
      this._muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      this._muted = false;
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  /** 必须在用户手势中调用一次，解锁 AudioContext（iOS Safari 自动播放限制） */
  unlock(): void {
    if (!this.ctx) {
      try {
        const w = window as unknown as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        };
        const Ctor = w.AudioContext ?? w.webkitAudioContext;
        if (Ctor) this.ctx = new Ctor();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    try {
      localStorage.setItem(MUTE_KEY, this._muted ? "1" : "0");
    } catch {
      // ignore
    }
    return this._muted;
  }

  private tone(
    freq: number,
    delay: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
  ): void {
    if (!this.ctx || this._muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  play(name: SfxName): void {
    if (!this.ctx || this._muted) return;
    switch (name) {
      case "step":
        this.tone(430, 0, 0.05, "sine", 0.1);
        break;
      case "collect":
        this.tone(660, 0, 0.09, "sine", 0.22);
        this.tone(990, 0.07, 0.13, "sine", 0.22);
        break;
      case "reject":
        this.tone(150, 0, 0.14, "square", 0.1, 110);
        break;
      case "undo":
        this.tone(520, 0, 0.09, "triangle", 0.16, 300);
        break;
      case "reset":
        this.tone(360, 0, 0.12, "triangle", 0.16, 220);
        break;
      case "hint":
        this.tone(880, 0, 0.08, "sine", 0.18);
        this.tone(1175, 0.07, 0.11, "sine", 0.18);
        break;
      case "win": {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => this.tone(f, i * 0.11, 0.2, "sine", 0.22));
        break;
      }
    }
  }
}

export const audio = new AudioManager();
