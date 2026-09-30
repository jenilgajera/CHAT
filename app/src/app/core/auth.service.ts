import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { SocketService } from './socket.service';
import { getToken, setToken } from './session';
import { AppUser } from '../data/models';

export type GateState = 'loading' | 'anon' | 'pending' | 'disabled' | 'active';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly sockets = inject(SocketService);
  private readonly router = inject(Router);

  readonly signedIn = signal(false);
  readonly profile = signal<AppUser | null>(null);
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);

  private unsubProfile: (() => void) | null = null;
  private readyWaiters: Array<() => void> = [];
  private currentFcm: string | null = null;

  constructor() {
    void this.restore();
  }

  whenReady(): Promise<void> {
    if (this.ready()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  gate(): GateState {
    if (!this.ready()) {
      return 'loading';
    }
    if (!this.signedIn() || !this.profile()) {
      return 'anon';
    }
    const status = this.profile()?.status;
    if (status === 'active') {
      return 'active';
    }
    if (status === 'disabled') {
      return 'disabled';
    }
    return 'pending';
  }

  isAdmin(): boolean {
    return this.profile()?.role === 'admin' && this.profile()?.status === 'active';
  }

  uid(): string {
    return this.profile()?.uid ?? '';
  }

  async register(input: {
    name: string;
    username: string;
    password: string;
    inviteCode: string;
  }): Promise<void> {
    this.error.set(null);
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      throw new Error('Username must be 3-20 characters: a-z, 0-9, underscore.');
    }
    if (input.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    if (!input.name.trim()) {
      throw new Error('Name is required.');
    }
    const data = await this.api.post<{ token: string; user: AppUser }>('/auth/register', {
      name: input.name,
      username,
      password: input.password,
      inviteCode: input.inviteCode,
    });
    this.applySession(data.token, data.user);
  }

  async login(username: string, password: string): Promise<void> {
    this.error.set(null);
    const data = await this.api.post<{ token: string; user: AppUser }>('/auth/login', {
      username: username.trim().toLowerCase(),
      password,
    });
    this.applySession(data.token, data.user);
  }

  rememberFcm(token: string | null): void {
    this.currentFcm = token;
  }

  async logout(): Promise<void> {
    const token = this.currentFcm;
    if (token) {
      try {
        await this.api.post('/users/me/fcm', { token, remove: true });
      } catch {
        // still sign out
      }
    }
    this.currentFcm = null;
    this.unsubProfile?.();
    this.unsubProfile = null;
    this.sockets.disconnect();
    setToken(null);
    this.signedIn.set(false);
    this.profile.set(null);
    await this.router.navigateByUrl('/auth');
  }

  async changePassword(current: string, next: string): Promise<void> {
    if (next.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }
    await this.api.post('/auth/password', { current, next });
  }

  private async restore(): Promise<void> {
    const token = getToken();
    if (!token) {
      this.markReady();
      return;
    }
    try {
      const data = await this.api.get<{ user: AppUser }>('/auth/me');
      this.applySession(token, data.user);
    } catch {
      setToken(null);
      this.signedIn.set(false);
      this.profile.set(null);
    }
    this.markReady();
  }

  private applySession(token: string, user: AppUser): void {
    setToken(token);
    this.signedIn.set(true);
    this.profile.set(user);
    this.sockets.connect();
    this.unsubProfile?.();
    this.unsubProfile = this.sockets.on<AppUser>('profile', (next) => {
      if (next?.uid === user.uid || next?.uid === this.uid()) {
        this.profile.set(next);
      }
    });
    this.markReady();
  }

  private markReady(): void {
    this.ready.set(true);
    const waiters = this.readyWaiters.splice(0);
    for (const w of waiters) {
      w();
    }
  }
}
