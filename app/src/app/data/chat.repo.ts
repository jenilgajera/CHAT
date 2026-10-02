import { Injectable, inject } from '@angular/core';
import { ApiService } from '../core/api.service';
import { SocketService } from '../core/socket.service';
import { Chat, ChatMessage, ReplyTo } from './models';

@Injectable({ providedIn: 'root' })
export class ChatRepo {
  private readonly api = inject(ApiService);
  private readonly sockets = inject(SocketService);

  listenMyChats(_uid: string, cb: (chats: Chat[]) => void): () => void {
    void this.api.get<{ chats: Chat[] }>('/chats').then((data) => cb(data.chats));
    return this.sockets.on<Chat[]>('chats:updated', (chats) => cb(chats));
  }

  listenChat(chatId: string, cb: (chat: Chat | null) => void, onError?: (error: unknown) => void): () => void {
    void this.api
      .get<{ chat: Chat }>(`/chats/${chatId}`)
      .then((data) => cb(data.chat))
      .catch((error: unknown) => onError?.(error));
    this.sockets.emit('join:chat', chatId);
    return this.sockets.on<Chat>('chat:updated', (chat) => {
      if (chat?.id === chatId) {
        cb(chat);
      }
    });
  }

  listenLatestMessages(
    chatId: string,
    cb: (messages: ChatMessage[], oldestId: string | null) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    const load = async () => {
      const data = await this.api.get<{ messages: ChatMessage[]; oldestId: string | null }>(
        `/chats/${chatId}/messages?limit=30`,
      );
      cb(data.messages, data.oldestId);
    };
    void load().catch((error: unknown) => onError?.(error));
    this.sockets.emit('join:chat', chatId);
    const offNew = this.sockets.on<{ chatId: string; message: ChatMessage }>('message:new', (payload) => {
      if (payload.chatId === chatId) {
        void load().catch((error: unknown) => onError?.(error));
      }
    });
    return () => {
      offNew();
      this.sockets.emit('leave:chat', chatId);
    };
  }

  async latestMessage(chatId: string): Promise<ChatMessage | null> {
    const data = await this.api.get<{ message: ChatMessage | null }>(`/chats/${chatId}/messages/latest`);
    return data.message;
  }

  async loadOlder(
    chatId: string,
    before: string,
  ): Promise<{ messages: ChatMessage[]; last: string | null }> {
    const data = await this.api.get<{ messages: ChatMessage[]; oldestId: string | null }>(
      `/chats/${chatId}/messages?before=${encodeURIComponent(before)}&limit=30`,
    );
    return { messages: data.messages, last: data.oldestId };
  }

  async getChat(chatId: string): Promise<Chat> {
    const data = await this.api.get<{ chat: Chat }>(`/chats/${chatId}`);
    return data.chat;
  }

  async ensurePrivateChat(_myUid: string, otherUid: string): Promise<string> {
    const data = await this.api.post<{ chat: Chat }>('/chats/private', { otherId: otherUid });
    return data.chat.id;
  }

  async createGroup(input: {
    name: string;
    avatar: string;
    creatorId: string;
    memberIds: string[];
  }): Promise<string> {
    const data = await this.api.post<{ chat: Chat }>('/chats/groups', {
      name: input.name,
      avatar: input.avatar,
      memberIds: input.memberIds,
    });
    return data.chat.id;
  }

  async sendMessage(input: {
    chatId: string;
    senderId: string;
    type: ChatMessage['type'];
    text: string;
    image?: string;
    replyTo?: ReplyTo | null;
    clientId: string;
    memberIds: string[];
  }): Promise<string> {
    const data = await this.api.post<{ message: ChatMessage }>(`/chats/${input.chatId}/messages`, {
      type: input.type,
      text: input.text,
      image: input.image ?? '',
      replyTo: input.replyTo ?? null,
      clientId: input.clientId,
    });
    return data.message.id;
  }

  async sendSystem(chatId: string, _senderId: string, text: string): Promise<void> {
    await this.api.post(`/chats/${chatId}/messages`, {
      type: 'system',
      text,
      clientId: `sys-${Date.now()}`,
    });
  }

  async clearUnread(chatId: string, _uid: string): Promise<void> {
    await this.api.post(`/chats/${chatId}/read`, { messageIds: [] });
  }

  async markDelivered(chatId: string, messageIds: string[], _uid: string): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }
    await this.api.post(`/chats/${chatId}/delivered`, { messageIds });
  }

  async markRead(chatId: string, messageIds: string[], _uid: string): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }
    await this.api.post(`/chats/${chatId}/read`, { messageIds });
  }

  async setTyping(chatId: string, _uid: string): Promise<void> {
    this.sockets.emit('typing', chatId);
  }

  listenTyping(chatId: string, myUid: string, cb: (ids: string[]) => void): () => void {
    const active = new Map<string, number>();
    const flush = () => {
      const now = Date.now();
      for (const [id, at] of active) {
        if (now - at > 3500) {
          active.delete(id);
        }
      }
      cb([...active.keys()]);
    };
    const timer = setInterval(flush, 800);
    this.sockets.emit('join:chat', chatId);
    const off = this.sockets.on<{ chatId: string; uid: string }>('typing', (payload) => {
      if (payload.chatId !== chatId || payload.uid === myUid) {
        return;
      }
      active.set(payload.uid, Date.now());
      flush();
    });
    return () => {
      clearInterval(timer);
      off();
    };
  }

  async updateGroup(
    chatId: string,
    patch: Partial<Pick<Chat, 'name' | 'avatar' | 'members' | 'admins'>> & { system?: string },
  ): Promise<void> {
    await this.api.patch(`/chats/${chatId}`, patch);
  }

  async leaveGroup(chat: Chat, _uid: string): Promise<void> {
    await this.api.patch(`/chats/${chat.id}`, { leave: true });
  }

  async deleteForMe(chatId: string, messageId: string, _uid: string): Promise<void> {
    await this.api.post(`/chats/${chatId}/messages/${messageId}/delete-me`);
  }

  async deleteForEveryone(chatId: string, messageId: string): Promise<void> {
    await this.api.post(`/chats/${chatId}/messages/${messageId}/delete-all`);
  }

  async clearChat(chatId: string): Promise<void> {
    await this.api.post(`/chats/${chatId}/clear`);
  }

  async leaveChat(chatId: string): Promise<void> {
    await this.api.post(`/chats/${chatId}/leave`);
  }

  async react(chatId: string, messageId: string, emoji: string): Promise<void> {
    await this.api.post(`/chats/${chatId}/messages/${messageId}/react`, { emoji });
  }
}
