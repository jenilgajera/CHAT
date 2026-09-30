import { Component, input, output } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        <ion-title>Photo</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Close" (click)="closed.emit()">
            <ion-icon slot="icon-only" name="close"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding ion-text-center" [scrollY]="true">
      <img [src]="src()" alt="Full size photo" class="full" />
    </ion-content>
  `,
  styles: [
    `
      .full {
        max-width: 100%;
        height: auto;
      }
    `,
  ],
})
export class ImageViewerComponent {
  readonly src = input.required<string>();
  readonly closed = output<void>();

  constructor() {
    addIcons({ close });
  }
}
