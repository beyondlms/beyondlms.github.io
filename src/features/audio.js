/**
 * 音频服务
 */

class AudioService {
  constructor() {
    this.audioCtx = null;
    this._audioListenersRegistered = false;
    this._unlocked = false;
    this._audioHealthTimer = null;
  }

  /**
   * 获取 AudioContext
   */
  getAudioCtx() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      try {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('AudioContext not supported:', e);
      }
    }
    return this.audioCtx;
  }

  /**
   * 解锁音频（用户交互后调用）
   */
  unlock() {
    const ctx = this.getAudioCtx();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // 创建并播放一个静音的缓冲区来解锁
    if (ctx.state === 'running') {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      this._unlocked = true;
    }
  }

  /**
   * 注册音频监听器
   */
  registerListeners() {
    if (this._audioListenersRegistered) return;

    const unlockHandler = () => this.unlock();

    document.addEventListener('touchstart', unlockHandler, { once: false, passive: true });
    document.addEventListener('touchend', unlockHandler, { once: false, passive: true });
    document.addEventListener('click', unlockHandler, { once: false });

    this._audioListenersRegistered = true;
  }

  /**
   * 恢复 AudioContext
   */
  recover() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.getAudioCtx();
      this.registerListeners();
      return;
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * 播放蜂鸣音
   */
  playBeep(frequency = 800, duration = 200, type = 'sine') {
    const ctx = this.getAudioCtx();
    if (!ctx || ctx.state !== 'running') return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  }

  /**
   * 播放普通预警音
   */
  playAlertSound() {
    const ctx = this.getAudioCtx();
    if (!ctx || ctx.state !== 'running') return;

    // 双音警报
    this.playBeep(880, 150);
    setTimeout(() => this.playBeep(1100, 200), 180);
  }

  /**
   * 播放通知音
   */
  playNotifySound() {
    const ctx = this.getAudioCtx();
    if (!ctx || ctx.state !== 'running') return;

    this.playBeep(660, 100);
  }

  /**
   * 播放紧急音
   */
  playUrgentSound() {
    const ctx = this.getAudioCtx();
    if (!ctx || ctx.state !== 'running') return;

    // 三音紧急警报
    this.playBeep(1000, 100);
    setTimeout(() => this.playBeep(1200, 100), 120);
    setTimeout(() => this.playBeep(1400, 200), 240);
  }

  /**
   * 关闭 AudioContext
   */
  close() {
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
    this.audioCtx = null;
  }
}

export const audioService = new AudioService();
export default audioService;
