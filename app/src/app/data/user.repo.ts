import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { SocketService } from '../core/socket.service';
import { AppUser } from './models';

@Injectable({ providedIn: 'root' })
export class UserRepo {
  private readonly api = inject(ApiService);
  private readonly sockets = inject(SocketService);
  readonly cache = signal<Map<string, AppUser>>(new Map());
  readonly activeUsers = signal<AppUser[]>([]);
  private activeLoaded = false;
  private activeInflight: Promise<void> | null = null;

  listenUser(uid: string, cb: (user: AppUser | null) => void): () => void {
    void this.getUser(uid).then((user) => cb(user));
    return this.sockets.on<AppUser>('profile', (user) => {
      if (user?.uid === uid) {
        this.putCache(user);
        cb(user);
      }
    });
  }

  async getUser(uid: string): Promise<AppUser | null> {
    const cached = this.cache().get(uid);
    if (cached) {
      return cached;
    }
    try {
      const data = await this.api.get<{ user: AppUser }>(`/users/${uid}`);
      this.putCache(data.user);
      return data.user;
    } catch {
      return null;
    }
  }

  async loadActiveUsers(force = false): Promise<AppUser[]> {
    if (this.activeLoaded && !force) {
      return this.activeUsers();
    }
    if (this.activeInflight) {
      await this.activeInflight;
      return this.activeUsers();
    }
    this.activeInflight = (async () => {
      const data = await this.api.get<{ users: AppUser[] }>('/users');
      const users = data.users;
      const next = new Map(this.cache());
      for (const u of users) {
        next.set(u.uid, u);
      }
      this.cache.set(next);
      this.activeUsers.set(users);
      this.activeLoaded = true;
    })();
    try {
      await this.activeInflight;
    } finally {
      this.activeInflight = null;
    }
    return this.activeUsers();
  }

  async updateOwn(
    _uid: string,
    patch: Partial<Pick<AppUser, 'name' | 'about' | 'avatar' | 'theme'>>,
  ): Promise<void> {
    const data = await this.api.patch<{ user: AppUser }>('/users/me', patch);
    this.putCache(data.user);
  }

  async updateLastSeen(_uid: string): Promise<void> {
    await this.api.post('/users/me/heartbeat');
  }

  async setMuted(_uid: string, chatId: string, muted: boolean): Promise<void> {
    const data = await this.api.post<{ user: AppUser }>('/users/me/mute', { chatId, muted });
    this.putCache(data.user);
  }

  async addFcmToken(_uid: string, token: string): Promise<void> {
    await this.api.post('/users/me/fcm', { token });
  }

  async removeFcmToken(_uid: string, token: string): Promise<void> {
    await this.api.post('/users/me/fcm', { token, remove: true });
  }

  displayName(uid: string, fallback = 'Someone'): string {
    return this.cache().get(uid)?.name ?? fallback;
  }

  private putCache(user: AppUser): void {
    const next = new Map(this.cache());
    next.set(user.uid, user);
    this.cache.set(next);
  }
}
