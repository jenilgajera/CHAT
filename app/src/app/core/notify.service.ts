import { Injectable, inject, signal } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly toastCtrl = inject(ToastController);
  private readonly auth = inject(AuthService);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly openChatId = signal<string | null>(null);
  private audioCtx: AudioContext | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.online.set(true));
      window.addEventListener('offline', () => this.online.set(false));
    }
  }

  setOpenChat(id: string | null): void {
    this.openChatId.set(id);
  }

  async incomingFromOtherChat(chatId: string, preview: string, muted: boolean): Promise<void> {
    if (this.openChatId() === chatId) {
      return;
    }
    if (this.auth.gate() !== 'active') {
      return;
    }
    if (!muted) {
      this.beep();
    }
    const toast = await this.toastCtrl.create({
      message: preview,
      duration: 2200,
      position: 'top',
      cssClass: 'incoming-toast',
    });
    await toast.present();
  }

  async show(message: string, color: 'danger' | 'success' | 'medium' = 'medium'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  private beep(): void {
    try {
      this.audioCtx ??= new AudioContext();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.12);
    } catch {
      // no audio
    }
  }
}
