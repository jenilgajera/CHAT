import { Component, input, output } from '@angular/core';
import { ChatMessage } from '../data/models';
import { formatClock } from './time.util';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  template: `
    @if (message().type === 'system') {
      <div class="sys">{{ message().text }}</div>
    } @else {
      <button type="button" class="bubble" [class.mine]="mine()" (click)="open.emit(message())" (contextmenu)="onMenu($event)">
        @if (showName()) {
          <div class="sender" [style.color]="nameColor()">{{ senderName() }}</div>
        }
        @if (message().replyTo; as reply) {
          <div class="quote">
            <strong>{{ reply.senderName }}</strong>
            <span>{{ reply.text }}</span>
          </div>
        }
        @if (message().deletedForAll) {
          <em class="deleted">This message was deleted</em>
        } @else if (message().type === 'image') {
          <img [src]="message().image" alt="Photo" class="pic" />
          @if (message().text) {
            <p>{{ message().text }}</p>
          }
        } @else {
          <p>{{ message().text }}</p>
        }
        <div class="meta">
          <time>{{ formatClock(message().createdAt) }}</time>
          @if (mine()) {
            <span class="ticks" [class.read]="ticks() === 'read'" [attr.aria-label]="ticks()">
              @if (message().pending) {
                🕒
              } @else if (ticks() === 'read') {
                ✓✓
              } @else if (ticks() === 'delivered') {
                ✓✓
              } @else {
                ✓
              }
            </span>
          }
        </div>
        @if (reactionEntries().length) {
          <div class="reactions">
            @for (reaction of reactionEntries(); track reaction[0]) {
              <span class="reaction">{{ reaction[0] }} {{ reaction[1] }}</span>
            }
          </div>
        }
      </button>
    }
  `,
  styles: [
    `
      .sys {
        text-align: center;
        font-size: 12px;
        color: var(--fc-muted);
        margin: 8px auto;
        background: color-mix(in srgb, var(--fc-panel) 88%, var(--fc-text) 8%);
        padding: 4px 10px;
        border-radius: 8px;
        width: fit-content;
      }
      .bubble {
        display: block;
        max-width: 82%;
        text-align: left;
        border: 0;
        border-radius: 8px;
        padding: 6px 8px 4px;
        margin: 2px 8px;
        box-shadow: 0 1px 0.5px var(--fc-shadow);
        background: var(--fc-panel);
        color: var(--fc-text);
      }
      .bubble.mine {
        margin-left: auto;
        background: var(--fc-mine);
      }
      .sender {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 2px;
      }
      .quote {
        border-left: 3px solid var(--fc-accent);
        padding: 4px 6px;
        margin-bottom: 4px;
        font-size: 12px;
        opacity: 0.9;
        display: flex;
        flex-direction: column;
      }
      p {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .pic {
        max-width: 220px;
        border-radius: 6px;
        display: block;
      }
      .meta {
        display: flex;
        justify-content: flex-end;
        gap: 4px;
        font-size: 11px;
        color: var(--fc-muted);
        margin-top: 2px;
      }
      .ticks.read {
        color: var(--fc-tick);
      }
      .deleted {
        color: var(--fc-muted);
      }
      .reactions {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        margin-top: 4px;
      }
      .reaction {
        border: 1px solid color-mix(in srgb, var(--fc-muted) 24%, transparent);
        border-radius: 999px;
        padding: 1px 6px;
        font-size: 12px;
        background: color-mix(in srgb, var(--fc-panel) 82%, transparent);
      }
    `,
  ],
})
export class MessageBubbleComponent {
  readonly message = input.required<ChatMessage>();
  readonly mine = input(false);
  readonly showName = input(false);
  readonly senderName = input('');
  readonly nameColor = input('#00a884');

  reactionEntries(): Array<[string, number]> {
    return Object.entries(this.message().reactions || {})
      .map(([emoji, users]) => [emoji, users.length] as [string, number])
      .filter((entry) => entry[1] > 0);
  }
  readonly ticks = input<'sent' | 'delivered' | 'read'>('sent');
  readonly open = output<ChatMessage>();
  readonly menu = output<ChatMessage>();
  readonly formatClock = formatClock;

  onMenu(ev: Event): void {
    ev.preventDefault();
    this.menu.emit(this.message());
  }
}
