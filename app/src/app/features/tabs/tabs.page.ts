import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubbles, settings, shieldCheckmark } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, RouterLink],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="chats" href="/tabs/chats" routerLink="/tabs/chats">
          <ion-icon name="chatbubbles"></ion-icon>
          <ion-label>Chats</ion-label>
        </ion-tab-button>
        @if (auth.isAdmin()) {
          <ion-tab-button tab="admin" href="/tabs/admin" routerLink="/tabs/admin">
            <ion-icon name="shield-checkmark"></ion-icon>
            <ion-label>Admin</ion-label>
          </ion-tab-button>
        }
        <ion-tab-button tab="settings" href="/tabs/settings" routerLink="/tabs/settings">
          <ion-icon name="settings"></ion-icon>
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {
  readonly auth = inject(AuthService);

  constructor() {
    addIcons({ chatbubbles, settings, shieldCheckmark });
  }
}
