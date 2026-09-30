export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending' | 'active' | 'disabled';
export type ChatType = 'private' | 'group' | 'broadcast';
export type MessageType = 'text' | 'image' | 'system';
export type ThemePref = 'system' | 'light' | 'dark';
export type IsoDate = string | Date | null;

export interface AppUser {
  uid: string;
  name: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  about: string;
  avatar: string;
  lastSeen: IsoDate;
  createdAt: IsoDate;
  fcmTokens: string[];
  mutedChats: string[];
  theme: ThemePref;
}

export interface LastMessage {
  text: string;
  type: MessageType;
  senderId: string;
  at: IsoDate;
}

export interface Chat {
  id: string;
  type: ChatType;
  name: string;
  avatar: string;
  members: string[];
  admins: string[];
  lastMessage: LastMessage | null;
  unread: Record<string, number>;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface ReplyTo {
  id: string;
  text: string;
  senderName: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  type: MessageType;
  text: string;
  image: string;
  replyTo: ReplyTo | null;
  createdAt: IsoDate;
  deliveredTo: string[];
  readBy: string[];
  deletedFor: string[];
  deletedForAll: boolean;
  clientId: string;
  pending?: boolean;
}

export interface AppSettings {
  inviteCode: string;
  registrationOpen: boolean;
}

export interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  targetId: string;
  meta: Record<string, string>;
  createdAt: IsoDate;
}

export const ANNOUNCEMENTS_CHAT_ID = 'announcements';
export const PAGE_SIZE = 30;
export const TYPING_EXPIRE_MS = 3000;
export const ONLINE_THRESHOLD_MS = 90_000;
export const HEARTBEAT_MS = 60_000;
export const MAX_IMAGE_CHARS = 150_000;
export const MAX_AVATAR_CHARS = 50_000;

export function privateChatId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

export function colorFromName(name: string): string {
  const colors = [
    '#53bdeb',
    '#00a884',
    '#e67e22',
    '#9b59b6',
    '#e74c3c',
    '#1abc9c',
    '#3498db',
    '#f1c40f',
    '#2ecc71',
    '#e91e63',
  ];
  let hash = 0;
  const source = name || '?';
  for (let i = 0; i < source.length; i++) {
    hash = source.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function isUserOnline(lastSeen: IsoDate | undefined, now = Date.now()): boolean {
  if (!lastSeen) {
    return false;
  }
  const ms = lastSeen instanceof Date ? lastSeen.getTime() : Date.parse(String(lastSeen));
  if (!Number.isFinite(ms)) {
    return false;
  }
  return now - ms < ONLINE_THRESHOLD_MS;
}
