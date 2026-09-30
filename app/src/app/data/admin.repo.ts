import { Injectable, inject } from '@angular/core';
import { ApiService } from '../core/api.service';
import { AppSettings, AppUser, AuditLog, Chat } from './models';

@Injectable({ providedIn: 'root' })
export class AdminRepo {
  private readonly api = inject(ApiService);

  async listPending(): Promise<AppUser[]> {
    const data = await this.api.get<{ users: AppUser[] }>('/admin/pending');
    return data.users;
  }

  async listUsers(): Promise<AppUser[]> {
    const data = await this.api.get<{ users: AppUser[] }>('/admin/users');
    return data.users;
  }

  async listGroups(): Promise<Chat[]> {
    const data = await this.api.get<{ groups: Chat[] }>('/admin/groups');
    return data.groups;
  }

  async approveUser(_adminId: string, uid: string, _name: string): Promise<void> {
    await this.api.post(`/admin/users/${uid}/approve`);
  }

  async rejectUser(_adminId: string, uid: string, _name: string): Promise<void> {
    await this.api.post(`/admin/users/${uid}/reject`);
  }

  async setUserStatus(_adminId: string, uid: string, status: 'active' | 'disabled'): Promise<void> {
    await this.api.post(`/admin/users/${uid}/status`, { status });
  }

  async setUserRole(_adminId: string, uid: string, role: 'user' | 'admin'): Promise<void> {
    await this.api.post(`/admin/users/${uid}/role`, { role });
  }

  async adminCount(): Promise<number> {
    const users = await this.listUsers();
    return users.filter((u) => u.role === 'admin').length;
  }

  async deleteUserFromChats(_adminId: string, uid: string): Promise<void> {
    await this.api.post(`/admin/users/${uid}/delete`);
  }

  async getSettings(): Promise<AppSettings> {
    return this.api.get<AppSettings>('/admin/settings');
  }

  async saveSettings(_adminId: string, settings: AppSettings): Promise<void> {
    await this.api.patch('/admin/settings', settings);
  }

  async deleteGroup(_adminId: string, chatId: string, _name: string): Promise<void> {
    await this.api.delete(`/admin/groups/${chatId}`);
  }

  async broadcast(_adminId: string, text: string, _memberIds: string[]): Promise<void> {
    await this.api.post('/admin/broadcast', { text });
  }

  async stats(): Promise<{ users: number; pending: number; groups: number; messagesToday: number }> {
    return this.api.get('/admin/stats');
  }

  listenAudit(cb: (logs: AuditLog[]) => void): () => void {
    const load = async () => {
      try {
        const data = await this.api.get<{ logs: AuditLog[] }>('/admin/audit');
        cb(data.logs);
      } catch {
        cb([]);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 8000);
    return () => clearInterval(timer);
  }
}
