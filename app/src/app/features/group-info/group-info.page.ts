import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { ChatRepo } from '../../data/chat.repo';
import { UserRepo } from '../../data/user.repo';
import { Chat, ChatMessage, isUserOnline } from '../../data/models';
import { AvatarComponent } from '../../shared/avatar.component';
import { formatLastSeen } from '../../shared/time.util';

@Component({
  selector: 'app-group-info',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    AvatarComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar class="wa-toolbar">
        <ion-buttons slot="start">
          <ion-button (click)="back()">Back</ion-button>
        </ion-buttons>
        <ion-title>Group info</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (chat(); as c) {
        <div class="hero">
          <app-avatar [name]="c.name" [src]="c.avatar"></app-avatar>
          <h1>{{ c.name }}</h1>
          <p>{{ c.members.length }} members</p>
        </div>
        @if (isAdmin()) {
          <ion-list>
            <ion-item button (click)="rename()">Rename group</ion-item>
            <ion-item button (click)="addMember()">Add member</ion-item>
          </ion-list>
        }
        <ion-list [inset]="true">
          @for (uid of c.members; track uid) {
            <ion-item>
              <app-avatar [name]="name(uid)" [src]="photo(uid)"></app-avatar>
              <ion-label>
                <h2>{{ name(uid) }} @if (c.admins.includes(uid)) { <small>admin</small> }</h2>
                <p>{{ seen(uid) }}</p>
              </ion-label>
              @if (isAdmin() && uid !== me) {
                <ion-button fill="clear" size="small" (click)="toggleAdmin(uid)">
                  {{ c.admins.includes(uid) ? 'Demote' : 'Make admin' }}
                </ion-button>
                <ion-button fill="clear" color="danger" size="small" (click)="remove(uid)">Remove</ion-button>
              }
            </ion-item>
          }
        </ion-list>
        @if (last(); as msg) {
          <ion-list [inset]="true">
            <ion-item>
              <ion-label>
                <h2>Last message reads</h2>
                <p>{{ readList(msg) }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        }
        <div class="pad">
          <ion-button expand="block" color="danger" (click)="leave()">Leave group</ion-button>
        </div>
      }
    </ion-content>
  `,
  styles: [
    `
      .hero {
        text-align: center;
        padding: 24px;
      }
      app-avatar {
        --av-size: 88px;
      }
      .pad {
        padding: 16px;
      }
    `,
  ],
})
export class GroupInfoPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly chats = inject(ChatRepo);
  private readonly users = inject(UserRepo);
  private readonly notify = inject(NotifyService);
  readonly chat = signal<Chat | null>(null);
  readonly last = signal<ChatMessage | null>(null);
  me = '';
  private chatId = '';

  ngOnInit(): void {
    this.me = this.auth.uid();
    this.chatId = this.route.snapshot.paramMap.get('id') ?? '';
    void this.load();
  }

  isAdmin(): boolean {
    return !!this.chat()?.admins.includes(this.me);
  }

  name(uid: string): string {
    return this.users.displayName(uid);
  }

  photo(uid: string): string {
    return this.users.cache().get(uid)?.avatar ?? '';
  }

  seen(uid: string): string {
    const u = this.users.cache().get(uid);
    return formatLastSeen(u?.lastSeen ?? null, isUserOnline(u?.lastSeen ?? null));
  }

  readList(msg: ChatMessage): string {
    if (msg.readBy.length === 0) {
      return 'Nobody has read it yet';
    }
    return msg.readBy.map((id) => this.name(id)).join(', ');
  }

  back(): void {
    void this.router.navigate(['/chat', this.chatId]);
  }

  async rename(): Promise<void> {
    const name = prompt('Group name', this.chat()?.name ?? '');
    if (!name?.trim()) {
      return;
    }
    await this.chats.updateGroup(this.chatId, { name: name.trim() });
    await this.chats.sendSystem(this.chatId, this.me, `Group renamed to ${name.trim()}`);
    await this.load();
  }

  async addMember(): Promise<void> {
    await this.users.loadActiveUsers();
    const existing = new Set(this.chat()?.members ?? []);
    const candidates = this.users.activeUsers().filter((u) => !existing.has(u.uid));
    if (candidates.length === 0) {
      await this.notify.show('No other active users to add');
      return;
    }
    const username = prompt(
      `Username to add:\n${candidates.map((u) => u.username).join(', ')}`,
    );
    const user = candidates.find((u) => u.username === username?.trim().toLowerCase());
    if (!user) {
      return;
    }
    await this.chats.updateGroup(this.chatId, { members: [...(this.chat()?.members ?? []), user.uid] });
    await this.chats.sendSystem(this.chatId, this.me, `${user.name} was added`);
    await this.load();
  }

  async toggleAdmin(uid: string): Promise<void> {
    const chat = this.chat();
    if (!chat) {
      return;
    }
    const admins = chat.admins.includes(uid)
      ? chat.admins.filter((id) => id !== uid)
      : [...chat.admins, uid];
    if (admins.length === 0) {
      await this.notify.show('A group needs at least one admin', 'danger');
      return;
    }
    await this.chats.updateGroup(this.chatId, { admins });
    await this.load();
  }

  async remove(uid: string): Promise<void> {
    const chat = this.chat();
    if (!chat) {
      return;
    }
    const members = chat.members.filter((id) => id !== uid);
    const admins = chat.admins.filter((id) => id !== uid);
    await this.chats.updateGroup(this.chatId, { members, admins });
    await this.chats.sendSystem(this.chatId, this.me, `${this.name(uid)} was removed`);
    await this.load();
  }

  async leave(): Promise<void> {
    const chat = this.chat();
    if (!chat) {
      return;
    }
    await this.chats.leaveGroup(chat, this.me);
    await this.router.navigateByUrl('/tabs/chats');
  }

  private async load(): Promise<void> {
    const chat = await this.chats.getChat(this.chatId);
    this.chat.set(chat);
    if (chat) {
      this.last.set(await this.chats.latestMessage(this.chatId));
    }
  }
}
