import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { AdminRepo } from '../../data/admin.repo';
import { UserRepo } from '../../data/user.repo';
import { AppSettings, AppUser, AuditLog, Chat } from '../../data/models';
import { formatListTime } from '../../shared/time.util';
import { EmptyStateComponent } from '../../shared/empty-state.component';

interface AdminUserRow {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  lastSeen: unknown;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonButton,
    IonInput,
    IonToggle,
    EmptyStateComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar class="wa-toolbar">
        <ion-title>Admin</ion-title>
      </ion-toolbar>
      <ion-toolbar class="wa-toolbar">
        <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))">
          <ion-segment-button value="pending">Pending</ion-segment-button>
          <ion-segment-button value="users">Users</ion-segment-button>
          <ion-segment-button value="groups">Groups</ion-segment-button>
          <ion-segment-button value="more">More</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (tab() === 'pending') {
        @if (pending().length === 0) {
          <app-empty-state title="No pending users" subtitle="New registrations will show up here."></app-empty-state>
        } @else {
          <ion-list>
            @for (u of pending(); track u.id) {
              <ion-item>
                <ion-label>
                  <h2>{{ u.name }}</h2>
                  <p>&#64;{{ u.username }}</p>
                </ion-label>
                <ion-button size="small" (click)="approve(u)">Approve</ion-button>
                <ion-button size="small" color="danger" fill="clear" (click)="reject(u)">Reject</ion-button>
              </ion-item>
            }
          </ion-list>
        }
      }
      @if (tab() === 'users') {
        <ion-list>
          @for (u of users(); track u.id) {
            <ion-item>
              <ion-label>
                <h2>{{ u.name }} · {{ u.role }} · {{ u.status }}</h2>
                <p>&#64;{{ u.username }} · {{ seen(u) }}</p>
              </ion-label>
              @if (u.id !== me) {
                <ion-button size="small" fill="clear" (click)="toggleStatus(u)">
                  {{ u.status === 'disabled' ? 'Enable' : 'Disable' }}
                </ion-button>
                <ion-button size="small" fill="clear" (click)="toggleRole(u)">
                  {{ u.role === 'admin' ? 'Demote' : 'Promote' }}
                </ion-button>
                <ion-button size="small" color="danger" fill="clear" (click)="removeUser(u)">Delete</ion-button>
              }
            </ion-item>
          }
        </ion-list>
      }
      @if (tab() === 'groups') {
        @if (groups().length === 0) {
          <app-empty-state title="No groups" subtitle="Groups created by members appear here."></app-empty-state>
        } @else {
          <ion-list>
            @for (g of groups(); track g.id) {
              <ion-item>
                <ion-label>
                  <h2>{{ g.name }}</h2>
                  <p>{{ g.members.length }} members</p>
                </ion-label>
                <ion-button size="small" color="danger" fill="clear" (click)="dropGroup(g)">Delete</ion-button>
              </ion-item>
            }
          </ion-list>
        }
      }
      @if (tab() === 'more') {
        <ion-list [inset]="true">
          <ion-list-header>Stats</ion-list-header>
          <ion-item>
            <ion-label>
              Users {{ stats().users }} · Pending {{ stats().pending }} · Groups {{ stats().groups }} ·
              Messages today {{ stats().messagesToday }}
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-button fill="clear" (click)="refresh()">Refresh stats</ion-button>
          </ion-item>
        </ion-list>
        <ion-list [inset]="true">
          <ion-list-header>Settings</ion-list-header>
          <ion-item>
            <ion-input label="Invite code" labelPlacement="stacked" [(ngModel)]="inviteCode"></ion-input>
          </ion-item>
          <ion-item>
            <ion-toggle [checked]="registrationOpen" (ionChange)="registrationOpen = $any($event.detail.checked)">
              Registration open
            </ion-toggle>
          </ion-item>
          <ion-item>
            <ion-button expand="block" (click)="saveSettings()">Save settings</ion-button>
          </ion-item>
        </ion-list>
        <ion-list [inset]="true">
          <ion-list-header>Broadcast</ion-list-header>
          <ion-item>
            <ion-input label="Announcement" labelPlacement="stacked" [(ngModel)]="broadcastText"></ion-input>
          </ion-item>
          <ion-item>
            <ion-button expand="block" (click)="sendBroadcast()">Post to Announcements</ion-button>
          </ion-item>
        </ion-list>
        <ion-list [inset]="true">
          <ion-list-header>Audit log</ion-list-header>
          @for (log of logs(); track log.id) {
            <ion-item>
              <ion-label>
                <h2>{{ log.action }}</h2>
                <p>{{ log.adminId }} → {{ log.targetId }} · {{ formatListTime(log.createdAt) }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class AdminPage implements OnInit, OnDestroy {
  private readonly admin = inject(AdminRepo);
  private readonly auth = inject(AuthService);
  private readonly usersRepo = inject(UserRepo);
  private readonly notify = inject(NotifyService);
  readonly formatListTime = formatListTime;
  readonly tab = signal<'pending' | 'users' | 'groups' | 'more'>('pending');
  readonly pending = signal<AdminUserRow[]>([]);
  readonly users = signal<AdminUserRow[]>([]);
  readonly groups = signal<Chat[]>([]);
  readonly logs = signal<AuditLog[]>([]);
  readonly stats = signal({ users: 0, pending: 0, groups: 0, messagesToday: 0 });
  inviteCode = 'FRIENDS';
  registrationOpen = true;
  broadcastText = '';
  me = '';
  private unsub: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    this.me = this.auth.uid();
    this.unsub = this.admin.listenAudit((logs) => this.logs.set(logs));
    await this.refresh();
  }

  ngOnDestroy(): void {
    this.unsub?.();
  }

  seen(u: AdminUserRow): string {
    return formatListTime(u.lastSeen as never);
  }

  async refresh(): Promise<void> {
    try {
      const [pending, users, groups, stats, settings] = await Promise.all([
        this.admin.listPending(),
        this.admin.listUsers(),
        this.admin.listGroups(),
        this.admin.stats(),
        this.loadSettings(),
      ]);
      this.pending.set(pending.map((u) => this.row(u)));
      this.users.set(users.map((u) => this.row(u)));
      this.groups.set(groups);
      this.stats.set(stats);
      this.inviteCode = settings.inviteCode;
      this.registrationOpen = settings.registrationOpen;
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Could not load admin data', 'danger');
    }
  }

  async approve(u: AdminUserRow): Promise<void> {
    try {
      await this.admin.approveUser(this.me, u.id, u.name);
      await this.usersRepo.loadActiveUsers(true);
      await this.refresh();
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Approve failed', 'danger');
    }
  }

  async reject(u: AdminUserRow): Promise<void> {
    try {
      await this.admin.rejectUser(this.me, u.id, u.name);
      await this.refresh();
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Reject failed', 'danger');
    }
  }

  async toggleStatus(u: AdminUserRow): Promise<void> {
    if (u.id === this.me) {
      await this.notify.show('You cannot disable your own account', 'danger');
      return;
    }
    try {
      await this.admin.setUserStatus(this.me, u.id, u.status === 'disabled' ? 'active' : 'disabled');
      await this.refresh();
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Status update failed', 'danger');
    }
  }

  async toggleRole(u: AdminUserRow): Promise<void> {
    if (u.role === 'admin') {
      const count = await this.admin.adminCount();
      if (count <= 1) {
        await this.notify.show('The last admin cannot be demoted', 'danger');
        return;
      }
    }
    try {
      await this.admin.setUserRole(this.me, u.id, u.role === 'admin' ? 'user' : 'admin');
      await this.refresh();
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Role update failed', 'danger');
    }
  }

  async removeUser(u: AdminUserRow): Promise<void> {
    if (u.id === this.me) {
      await this.notify.show('You cannot delete your own account', 'danger');
      return;
    }
    try {
      await this.admin.deleteUserFromChats(this.me, u.id);
      await this.refresh();
      await this.notify.show('User disabled and removed from chats. Auth login still exists.');
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Delete failed', 'danger');
    }
  }

  async dropGroup(g: Chat): Promise<void> {
    try {
      await this.admin.deleteGroup(this.me, g.id, g.name);
      await this.refresh();
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Could not delete group', 'danger');
    }
  }

  async saveSettings(): Promise<void> {
    try {
      await this.admin.saveSettings(this.me, {
        inviteCode: this.inviteCode.trim() || 'FRIENDS',
        registrationOpen: this.registrationOpen,
      });
      await this.notify.show('Settings saved', 'success');
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Could not save settings', 'danger');
    }
  }

  async sendBroadcast(): Promise<void> {
    const text = this.broadcastText.trim();
    if (!text) {
      return;
    }
    try {
      const members = this.users()
        .filter((u) => u.status === 'active')
        .map((u) => u.id);
      await this.admin.broadcast(this.me, text, members);
      this.broadcastText = '';
      await this.notify.show('Announcement posted', 'success');
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Broadcast failed', 'danger');
    }
  }

  private row(u: AppUser): AdminUserRow {
    return {
      id: u.uid,
      name: u.name,
      username: u.username,
      role: u.role,
      status: u.status,
      lastSeen: u.lastSeen,
    };
  }

  private async loadSettings(): Promise<AppSettings> {
    return this.admin.getSettings();
  }
}
