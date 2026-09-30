import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-status',
  standalone: true,
  imports: [IonContent, IonButton],
  template: `
    <ion-content class="auth-screen">
      <div class="hero">
        <div class="logo" aria-hidden="true">{{ kind() === 'pending' ? '⏳' : '🚫' }}</div>
        <h1>{{ kind() === 'pending' ? 'Waiting for approval' : 'Account disabled' }}</h1>
        <p>
          {{
            kind() === 'pending'
              ? 'An admin needs to approve your account before you can chat.'
              : 'This account is disabled. Contact an admin to restore access.'
          }}
        </p>
        <ion-button fill="outline" color="light" (click)="logout()">Log out</ion-button>
      </div>
    </ion-content>
  `,
})
export class StatusPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  kind(): 'pending' | 'disabled' {
    return this.router.url.includes('disabled') ? 'disabled' : 'pending';
  }

  logout(): void {
    void this.auth.logout();
  }
}
