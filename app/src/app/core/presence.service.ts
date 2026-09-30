import { Injectable, inject, signal } from '@angular/core';
import { HEARTBEAT_MS } from '../data/models';
import { AuthService } from './auth.service';
import { UserRepo } from '../data/user.repo';

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserRepo);
  readonly visible = signal(true);
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('focus', this.beat);
    window.addEventListener('online', this.beat);
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_MS);
    void this.beat();
  }

  stop(): void {
    this.started = false;
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('focus', this.beat);
    window.removeEventListener('online', this.beat);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private onVis = (): void => {
    this.visible.set(document.visibilityState === 'visible');
    if (this.visible()) {
      void this.beat();
    }
  };

  private beat = async (): Promise<void> => {
    const uid = this.auth.uid();
    if (!uid || this.auth.gate() !== 'active') {
      return;
    }
    try {
      await this.users.updateLastSeen(uid);
    } catch {
      // ignore offline heartbeat failures; cache will retry
    }
  };
}
