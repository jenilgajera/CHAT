import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSkeletonText,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { ChatRepo } from '../../data/chat.repo';
import { UserRepo } from '../../data/user.repo';
import { ANNOUNCEMENTS_CHAT_ID, Chat } from '../../data/models';
import { AvatarComponent } from '../../shared/avatar.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { formatListTime, millis } from '../../shared/time.util';

@Component({
  selector: 'app-chats',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSkeletonText,
    IonSearchbar,
    RouterLink,
    AvatarComponent,
    EmptyStateComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar class="wa-toolbar">
        <ion-title>REYOM WH</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/new-chat" aria-label="New chat">
            <ion-icon slot="icon-only" name="create-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-searchbar
      class="chat-search"
      placeholder="Search chats"
      [debounce]="120"
      (ionInput)="query.set($any($event.detail.value) ?? '')"
    ></ion-searchbar>
    <ion-content>
      @if (loading()) {
        <ion-list>
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <ion-item>
              <ion-skeleton-text [animated]="true" style="width: 48px; height: 48px; border-radius: 50%"></ion-skeleton-text>
              <ion-label>
                <ion-skeleton-text [animated]="true" style="width: 40%"></ion-skeleton-text>
                <ion-skeleton-text [animated]="true" style="width: 70%"></ion-skeleton-text>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      } @else if (chats().length === 0) {
        <app-empty-state title="No chats yet" subtitle="Tap the new-chat icon to message a friend."></app-empty-state>
      } @else {
        <ion-list>
          @for (chat of filteredChats(); track chat.id) {
            <ion-item [button]="true" (click)="open(chat.id)" [detail]="false">
              <app-avatar [name]="title(chat)" [src]="photo(chat)"></app-avatar>
              <ion-label>
                <h2>{{ title(chat) }}</h2>
                <p>{{ preview(chat) }}</p>
              </ion-label>
              <div class="end" slot="end">
                <span class="time">{{ formatListTime(chat.updatedAt) }}</span>
                @if (unread(chat) > 0) {
                  <ion-badge color="success">{{ unread(chat) }}</ion-badge>
                }
              </div>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
  styles: [
    `
      app-avatar {
        --av-size: 48px;
        margin-inline-end: 12px;
      }
      ion-content {
        --background: var(--fc-panel);
      }
      .chat-search {
        --background: var(--fc-page);
        --border-radius: 10px;
        --box-shadow: none;
        --color: var(--fc-text);
        --placeholder-color: var(--fc-muted);
        padding: 8px 12px;
      }
      ion-list {
        padding: 0;
      }
      ion-item {
        --background: var(--fc-panel);
        --border-color: var(--fc-line);
        --min-height: 76px;
        --padding-start: 16px;
        --inner-padding-end: 14px;
        transition: background 160ms ease;
      }
      ion-item:hover {
        --background: var(--fc-hover);
      }
      h2 {
        margin: 0 0 4px;
        color: var(--fc-text);
        font-size: 16px;
        font-weight: 700;
      }
      p {
        margin: 0;
        color: var(--fc-muted);
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .end {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
      }
      .time {
        font-size: 12px;
        color: var(--fc-muted);
      }
      h2 {
        font-weight: 600;
      }
      ion-badge {
        min-width: 20px;
        border-radius: 999px;
        font-size: 11px;
      }
    `,
  ],
})
export class ChatsPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly chatRepo = inject(ChatRepo);
  private readonly users = inject(UserRepo);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  readonly chats = signal<Chat[]>([]);
  readonly query = signal('');
  readonly loading = signal(true);
  readonly formatListTime = formatListTime;
  private unsub: (() => void) | null = null;
  private lastIds = new Map<string, string>();

  filteredChats(): Chat[] {
    const query = this.query().trim().toLowerCase();
    if (!query) {
      return this.chats();
    }
    return this.chats().filter((chat) => `${this.title(chat)} ${this.preview(chat)}`.toLowerCase().includes(query));
  }

  constructor() {
    addIcons({ createOutline });
  }

  async ngOnInit(): Promise<void> {
    await this.users.loadActiveUsers();
    const uid = this.auth.uid();
    this.unsub = this.chatRepo.listenMyChats(uid, (list) => {
      const pinned = list.filter((c) => c.id === ANNOUNCEMENTS_CHAT_ID);
      const rest = list.filter((c) => c.id !== ANNOUNCEMENTS_CHAT_ID);
      const ordered = [...pinned, ...rest];
      this.detectIncoming(ordered);
      this.chats.set(ordered);
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.unsub?.();
  }

  title(chat: Chat): string {
    if (chat.type !== 'private') {
      return chat.name || 'Group';
    }
    const other = chat.members.find((id) => id !== this.auth.uid());
    return other ? this.users.displayName(other, 'Friend') : 'Chat';
  }

  photo(chat: Chat): string {
    if (chat.avatar) {
      return chat.avatar;
    }
    if (chat.type !== 'private') {
      return '';
    }
    const other = chat.members.find((id) => id !== this.auth.uid());
    return other ? (this.users.cache().get(other)?.avatar ?? '') : '';
  }

  preview(chat: Chat): string {
    const lm = chat.lastMessage;
    if (!lm) {
      return 'No messages yet';
    }
    const prefix = lm.senderId === this.auth.uid() ? 'You: ' : '';
    if (lm.type === 'image') {
      return prefix + (lm.text || 'Photo');
    }
    return prefix + (lm.text || '');
  }

  unread(chat: Chat): number {
    return chat.unread[this.auth.uid()] ?? 0;
  }

  open(id: string): void {
    void this.router.navigate(['/chat', id]);
  }

  private detectIncoming(list: Chat[]): void {
    const uid = this.auth.uid();
    const muted = this.auth.profile()?.mutedChats ?? [];
    for (const chat of list) {
      const lm = chat.lastMessage;
      const stamp = `${lm?.senderId ?? ''}:${millis(lm?.at)}:${lm?.text ?? ''}`;
      const prev = this.lastIds.get(chat.id);
      this.lastIds.set(chat.id, stamp);
      if (!prev || prev === stamp) {
        continue;
      }
      if (!lm || lm.senderId === uid) {
        continue;
      }
      void this.notify.incomingFromOtherChat(
        chat.id,
        `${this.title(chat)}: ${this.preview(chat)}`,
        muted.includes(chat.id),
      );
    }
  }
}
