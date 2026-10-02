import { environment } from '../../environments/environment';
import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRepo } from '../data/user.repo';
import { NotifyService } from './notify.service';

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserRepo);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private registered = false;

  async start(): Promise<void> {
    if (!environment.enablePush || this.registered) {
      return;
    }
    if (this.auth.gate() !== 'active') {
      return;
    }
    this.registered = true;
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      return;
    }
    await PushNotifications.createChannel({
      id: 'friends-chat-messages',
      name: 'Friends Chat messages',
      description: 'New private and group chat messages',
      importance: 5,
      visibility: 1,
      sound: 'default',
    });
    await PushNotifications.register();
    await PushNotifications.addListener('registration', (token) => {
      const uid = this.auth.uid();
      this.auth.rememberFcm(token.value);
      if (uid) {
        void this.users.addFcmToken(uid, token.value);
      }
    });
    await PushNotifications.addListener('registrationError', () => {
      void this.notify.show('Push registration failed', 'danger');
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
      const chatId = event.notification.data?.['chatId'] as string | undefined;
      if (chatId) {
        void this.router.navigate(['/chat', chatId]);
      }
    });
  }
}
