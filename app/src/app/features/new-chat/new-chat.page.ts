import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { ChatRepo } from '../../data/chat.repo';
import { UserRepo } from '../../data/user.repo';
import { AppUser } from '../../data/models';
import { AvatarComponent } from '../../shared/avatar.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { compressAvatar } from '../../shared/image.util';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Component({
  selector: 'app-new-chat',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonCheckbox,
    IonInput,
    IonSegment,
    IonSegmentButton,
    AvatarComponent,
    EmptyStateComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar class="wa-toolbar">
        <ion-buttons slot="start">
          <ion-button (click)="back()">Close</ion-button>
        </ion-buttons>
        <ion-title>{{ mode() === 'private' ? 'New chat' : 'New group' }}</ion-title>
        @if (mode() === 'group') {
          <ion-buttons slot="end">
            <ion-button [disabled]="selected().length < 1 || !groupName.trim()" (click)="createGroup()">Create</ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      <ion-toolbar class="wa-toolbar">
        <ion-segment [value]="mode()" (ionChange)="mode.set($any($event.detail.value))">
          <ion-segment-button value="private">Private</ion-segment-button>
          <ion-segment-button value="group">Group</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (mode() === 'group') {
        <ion-list>
          <ion-item>
            <ion-input label="Group name" labelPlacement="stacked" [(ngModel)]="groupName"></ion-input>
          </ion-item>
          <ion-item button (click)="pickAvatar()">
            <ion-label>Optional group photo</ion-label>
          </ion-item>
        </ion-list>
      }
      @if (people().length === 0) {
        <app-empty-state title="No one else is active yet" subtitle="Ask friends to register and wait for admin approval."></app-empty-state>
      } @else {
        <ion-list>
          @for (user of people(); track user.uid) {
            <ion-item [button]="mode() === 'private'" (click)="startPrivate(user)" [detail]="false">
              <app-avatar [name]="user.name" [src]="user.avatar"></app-avatar>
              @if (mode() === 'group') {
                <ion-checkbox
                  labelPlacement="end"
                  [checked]="selected().includes(user.uid)"
                  (ionChange)="toggle(user.uid)"
                >
                  {{ user.name }}
                  <p>&#64;{{ user.username }}</p>
                </ion-checkbox>
              } @else {
                <ion-label>
                  <h2>{{ user.name }}</h2>
                  <p>&#64;{{ user.username }}</p>
                </ion-label>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
  styles: [
    `
      app-avatar {
        --av-size: 40px;
        margin-inline-end: 12px;
      }
    `,
  ],
})
export class NewChatPage {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserRepo);
  private readonly chats = inject(ChatRepo);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  readonly mode = signal<'private' | 'group'>('private');
  readonly selected = signal<string[]>([]);
  readonly people = computed(() =>
    this.users.activeUsers().filter((u) => u.uid !== this.auth.uid()),
  );
  groupName = '';
  groupAvatar = '';

  constructor() {
    void this.users.loadActiveUsers();
  }

  back(): void {
    void this.router.navigateByUrl('/tabs/chats');
  }

  toggle(uid: string): void {
    const cur = this.selected();
    this.selected.set(cur.includes(uid) ? cur.filter((id) => id !== uid) : [...cur, uid]);
  }

  async startPrivate(user: AppUser): Promise<void> {
    if (this.mode() !== 'private') {
      return;
    }
    try {
      const id = await this.chats.ensurePrivateChat(this.auth.uid(), user.uid);
      await this.router.navigate(['/chat', id]);
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Could not start chat', 'danger');
    }
  }

  async pickAvatar(): Promise<void> {
    try {
      const photo = await Camera.getPhoto({
        quality: 60,
        width: 400,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
      });
      if (photo.dataUrl) {
        this.groupAvatar = await compressAvatar(photo.dataUrl);
      }
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('cancel')) {
        return;
      }
      await this.notify.show('Could not pick a photo', 'danger');
    }
  }

  async createGroup(): Promise<void> {
    try {
      const id = await this.chats.createGroup({
        name: this.groupName,
        avatar: this.groupAvatar,
        creatorId: this.auth.uid(),
        memberIds: this.selected(),
      });
      await this.router.navigate(['/chat', id]);
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Could not create group', 'danger');
    }
  }
}
