import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { AuthService } from './core/auth.service';
import { NotifyService } from './core/notify.service';
import { PresenceService } from './core/presence.service';
import { PushService } from './core/push.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      @if (!auth.ready()) {
        <div class="app-loading" role="status" aria-label="Loading REYOM GROUP">
          <img src="https://cdn.dribbble.com/userupload/22307587/file/original-ba4b14f06771de8c2363dd09d5d7b4aa.gif" alt="Loading" />
          <strong>REYOM GROUP</strong>
        </div>
      }
      @if (!notify.online()) {
        <div class="reconnect" role="status">Connecting...</div>
      }
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent {
  readonly notify = inject(NotifyService);
  readonly auth = inject(AuthService);
  private readonly presence = inject(PresenceService);
  private readonly push = inject(PushService);
  private readonly theme = inject(ThemeService);

  constructor() {
    this.theme.init();
    effect(() => {
      this.auth.ready();
      this.auth.signedIn();
      this.auth.profile();
      const gate = this.auth.gate();
      if (gate === 'active') {
        this.presence.start();
        void this.push.start();
        const pref = this.auth.profile()?.theme;
        if (pref) {
          this.theme.apply(pref);
        }
      } else {
        this.presence.stop();
      }
    });
  }
}
