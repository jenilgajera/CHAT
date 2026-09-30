import { Component, inject, signal } from '@angular/core';
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
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { ThemeService } from '../../core/theme.service';
import { UserRepo } from '../../data/user.repo';
import { ThemePref } from '../../data/models';
import { AvatarComponent } from '../../shared/avatar.component';
import { compressAvatar } from '../../shared/image.util';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonSelect,
    IonSelectOption,
    IonToggle,
    AvatarComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar class="wa-toolbar">
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (auth.profile(); as me) {
        <div class="hero">
          <button type="button" class="photo" (click)="photo()" aria-label="Change profile photo">
            <app-avatar [name]="me.name" [src]="me.avatar"></app-avatar>
          </button>
          <h1>{{ me.name }}</h1>
          <p>&#64;{{ me.username }}</p>
        </div>
        <ion-list [inset]="true">
          <ion-item>
            <ion-input label="Name" labelPlacement="stacked" [(ngModel)]="name"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input label="About" labelPlacement="stacked" [(ngModel)]="about"></ion-input>
          </ion-item>
          <ion-item>
            <ion-button expand="block" (click)="saveProfile()">Save profile</ion-button>
          </ion-item>
        </ion-list>
        <ion-list [inset]="true">
          <ion-item>
            <ion-select label="Theme" labelPlacement="stacked" [value]="theme.preference()" (ionChange)="setTheme($any($event.detail.value))">
              <ion-select-option value="system">System</ion-select-option>
              <ion-select-option value="light">Light</ion-select-option>
              <ion-select-option value="dark">Dark</ion-select-option>
            </ion-select>
          </ion-item>
        </ion-list>
        <ion-list [inset]="true">
          <ion-list-header class="pad">Muted chats</ion-list-header>
          @for (id of me.mutedChats; track id) {
            <ion-item>
              <ion-label>{{ id }}</ion-label>
              <ion-toggle [checked]="true" (ionChange)="unmute(id)"></ion-toggle>
            </ion-item>
          }
        </ion-list>
        <ion-list [inset]="true">
          <ion-item>
            <ion-input label="Current password" labelPlacement="stacked" type="password" [(ngModel)]="currentPw"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input label="New password" labelPlacement="stacked" type="password" [(ngModel)]="nextPw"></ion-input>
          </ion-item>
          <ion-item>
            <ion-button expand="block" (click)="password()">Change password</ion-button>
          </ion-item>
        </ion-list>
        <div class="pad">
          <ion-button expand="block" fill="outline" color="light" (click)="logout()">Log out</ion-button>
        </div>
      }
    </ion-content>
  `,
  styles: [
    `
      .hero {
        text-align: center;
        padding: 24px 16px 8px;
      }
      .photo {
        background: none;
        border: 0;
      }
      app-avatar {
        --av-size: 96px;
      }
      .pad {
        padding: 8px 16px 24px;
      }
    `,
  ],
})
export class SettingsPage {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly users = inject(UserRepo);
  private readonly notify = inject(NotifyService);

  name = this.auth.profile()?.name ?? '';
  about = this.auth.profile()?.about ?? '';
  currentPw = '';
  nextPw = '';
  readonly muteBusy = signal(false);

  async saveProfile(): Promise<void> {
    try {
      await this.users.updateOwn(this.auth.uid(), { name: this.name.trim(), about: this.about.trim() });
      await this.notify.show('Profile saved', 'success');
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Could not save', 'danger');
    }
  }

  async setTheme(pref: ThemePref): Promise<void> {
    this.theme.apply(pref);
    try {
      await this.users.updateOwn(this.auth.uid(), { theme: pref });
    } catch {
      // local theme still applied
    }
  }

  async photo(): Promise<void> {
    try {
      const shot = await Camera.getPhoto({
        quality: 55,
        width: 400,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
      });
      if (!shot.dataUrl) {
        return;
      }
      const avatar = await compressAvatar(shot.dataUrl);
      await this.users.updateOwn(this.auth.uid(), { avatar });
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('cancel')) {
        return;
      }
      await this.notify.show(err instanceof Error ? err.message : 'Could not update photo', 'danger');
    }
  }

  async unmute(chatId: string): Promise<void> {
    await this.users.setMuted(this.auth.uid(), chatId, false);
  }

  async password(): Promise<void> {
    try {
      await this.auth.changePassword(this.currentPw, this.nextPw);
      this.currentPw = '';
      this.nextPw = '';
      await this.notify.show('Password updated', 'success');
    } catch (err) {
      await this.notify.show(err instanceof Error ? err.message : 'Could not change password', 'danger');
    }
  }

  logout(): void {
    void this.auth.logout();
  }
}
