import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { getToken } from './session';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;
  private readonly rooms = new Set<string>();
  private readonly queued: Array<{ event: string; args: unknown[] }> = [];

  connect(): void {
    const token = getToken();
    if (!token) {
      return;
    }
    this.disconnect();
    this.socket = io(environment.socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    this.socket.on('connect', () => {
      for (const item of this.queued.splice(0)) {
        this.socket?.emit(item.event, ...item.args);
      }
      for (const chatId of this.rooms) {
        this.socket?.emit('join:chat', chatId);
      }
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  emit(event: string, ...args: unknown[]): void {
    if (event === 'join:chat' && typeof args[0] === 'string') {
      this.rooms.add(args[0]);
    }
    if (event === 'leave:chat' && typeof args[0] === 'string') {
      this.rooms.delete(args[0]);
    }
    if (!this.socket?.connected) {
      this.queued.push({ event, args });
      return;
    }
    this.socket.emit(event, ...args);
  }

  on<T>(event: string, handler: (payload: T) => void): () => void {
    this.socket?.on(event, handler);
    return () => {
      this.socket?.off(event, handler);
    };
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }
}
