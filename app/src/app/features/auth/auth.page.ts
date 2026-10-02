import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
  IonText,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, IonContent, IonList, IonItem, IonInput, IonButton, IonText, IonSpinner],
  template: `
    <ion-content class="auth-screen">
      <div class="hero">
        <img class="logo reyom-logo" src="assets/reyom-logo.png" alt="REYOM GROUP" />
        <h1>REYOM GROUP</h1>
        <p>Private messenger for your group</p>
      </div>
      <ion-list [inset]="true" class="form">
        @if (mode() === 'register') {
          <ion-item>
            <ion-input label="Name" labelPlacement="stacked" [(ngModel)]="name" autocomplete="name"></ion-input>
          </ion-item>
        }
        <ion-item>
          <ion-input
            label="Username"
            labelPlacement="stacked"
            [(ngModel)]="username"
            autocomplete="username"
            [clearInput]="true"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Password"
            labelPlacement="stacked"
            type="password"
            [(ngModel)]="password"
            autocomplete="current-password"
          ></ion-input>
        </ion-item>
        @if (mode() === 'register') {
          <ion-item>
            <ion-input label="Invite code" labelPlacement="stacked" [(ngModel)]="invite"></ion-input>
          </ion-item>
        }
      </ion-list>
      @if (busy()) {
        <div class="center"><ion-spinner name="crescent"></ion-spinner></div>
      } @else {
        <div class="actions">
          <ion-button expand="block" (click)="submit()">
            {{ mode() === 'login' ? 'Log in' : 'Create account' }}
          </ion-button>
          <ion-button expand="block" fill="clear" (click)="toggle()">
            {{ mode() === 'login' ? 'Need an account? Register' : 'Have an account? Log in' }}
          </ion-button>
        </div>
      }
      <p class="hint">
        Usernames become a hidden login email like <ion-text color="medium">you&#64;friendschat.app</ion-text>.
        New accounts stay pending until an admin approves them.
      </p>
    </ion-content>
  `,
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  readonly mode = signal<'login' | 'register'>('login');
  readonly busy = signal(false);
  name = '';
  username = '';
  password = '';
  invite = '';

  toggle(): void {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.username, this.password);
      } else {
        await this.auth.register({
          name: this.name,
          username: this.username,
          password: this.password,
          inviteCode: this.invite,
        });
      }
      await this.auth.whenReady();
      const gate = this.auth.gate();
      if (gate === 'active') {
        await this.router.navigateByUrl('/tabs/chats');
      } else if (gate === 'disabled') {
        await this.router.navigateByUrl('/disabled');
      } else {
        await this.router.navigateByUrl('/pending');
      }
    } catch (err) {
      await this.notify.show(this.friendly(err), 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private friendly(err: unknown): string {
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
    if (code.includes('invalid-credential') || code.includes('user-not-found') || code.includes('wrong-password')) {
      return 'Wrong username or password.';
    }
    if (code.includes('email-already-in-use')) {
      return 'That username is already registered.';
    }
    if (err instanceof Error) {
      return err.message;
    }
    return 'Something went wrong. Try again.';
  }
}
