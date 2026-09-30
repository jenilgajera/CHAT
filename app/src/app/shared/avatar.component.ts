import { Component, input } from '@angular/core';
import { colorFromName, initials } from '../data/models';

@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="name() + ' avatar'" class="av" />
    } @else {
      <div class="av letters" [style.background]="colorFromName(name())" aria-hidden="true">
        {{ initials(name()) }}
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }
      .av {
        width: var(--av-size, 48px);
        height: var(--av-size, 48px);
        border-radius: 50%;
        object-fit: cover;
        display: grid;
        place-items: center;
        color: #fff;
        font-weight: 700;
        font-size: calc(var(--av-size, 48px) * 0.36);
      }
    `,
  ],
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly src = input('');
  readonly colorFromName = colorFromName;
  readonly initials = initials;
}
