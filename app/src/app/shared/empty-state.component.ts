import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="empty" role="status">
      <div class="glyph" aria-hidden="true">{{ glyph() }}</div>
      <h2>{{ title() }}</h2>
      <p>{{ subtitle() }}</p>
    </div>
  `,
  styles: [
    `
      .empty {
        text-align: center;
        padding: 48px 24px;
        color: var(--fc-muted);
      }
      .glyph {
        font-size: 42px;
        margin-bottom: 8px;
      }
      h2 {
        margin: 0 0 6px;
        font-size: 18px;
        color: var(--ion-text-color);
      }
      p {
        margin: 0;
        font-size: 14px;
      }
    `,
  ],
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly glyph = input('💬');
}
