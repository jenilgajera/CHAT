import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBack, attach, call, close, ellipsisVertical, happy, informationCircle, send, videocam } from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { ApiError } from '../../core/session';
import { SocketService } from '../../core/socket.service';
import { ChatRepo } from '../../data/chat.repo';
import { UserRepo } from '../../data/user.repo';
import { Chat, ChatMessage, ReplyTo, colorFromName, isUserOnline } from '../../data/models';
import { AvatarComponent } from '../../shared/avatar.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ImageViewerComponent } from '../../shared/image-viewer.component';
import { MessageBubbleComponent } from '../../shared/message-bubble.component';
import { compressChatImage } from '../../shared/image.util';
import { dayKey, formatDayLabel, formatLastSeen } from '../../shared/time.util';

const EMOJIS = ['😀', '😂', '😍', '🥰', '😎', '😭', '🙏', '👍', '👎', '🔥', '❤️', '🎉', '💯', '✨', '👋', '🤝', '😅', '😴', '🤔', '🙌'];
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonFooter,
    IonSearchbar,
    IonSpinner,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    AvatarComponent,
    MessageBubbleComponent,
    EmptyStateComponent,
    ImageViewerComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar class="wa-toolbar">
        <ion-buttons slot="start">
          <ion-button (click)="back()" aria-label="Back">
            <ion-icon slot="icon-only" name="arrow-back"></ion-icon>
          </ion-button>
        </ion-buttons>
        @if (chat(); as c) {
          <div class="head" (click)="maybeInfo()">
            <app-avatar [name]="title()" [src]="photo()"></app-avatar>
            <div>
              <div class="t">{{ title() }}</div>
              <div class="s">{{ subtitle() }}</div>
            </div>
          </div>
          <ion-buttons slot="end">
            @if (c.type === 'private') {
              <ion-button (click)="startVideoCall()" aria-label="Video call">
                <ion-icon slot="icon-only" name="videocam"></ion-icon>
              </ion-button>
            }
            <ion-button (click)="searching.set(!searching())" aria-label="Search">Search</ion-button>
            @if (c.type === 'group') {
              <ion-button (click)="info()" aria-label="Group info">
                <ion-icon slot="icon-only" name="information-circle"></ion-icon>
              </ion-button>
            }
            <ion-button (click)="toggleMute()" aria-label="Mute chat">{{ muted() ? 'Unmute' : 'Mute' }}</ion-button>
            <ion-button (click)="chatActions(c)" aria-label="Chat options">
              <ion-icon slot="icon-only" name="ellipsis-vertical"></ion-icon>
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      @if (searching()) {
        <ion-toolbar class="wa-toolbar">
          <ion-searchbar [debounce]="150" (ionInput)="query = $any($event.detail.value) ?? ''"></ion-searchbar>
        </ion-toolbar>
      }
    </ion-header>
    @if (loadError(); as error) {
      <div class="chat-error" role="alert">
        <span>{{ error }}</span>
        <ion-button size="small" fill="outline" (click)="retryLoad()">Retry</ion-button>
        <ion-button size="small" fill="clear" (click)="back()">Back</ion-button>
      </div>
    }
    @if (callOn()) {
      <div class="call-panel">
        <video #remoteVideo class="remote-video" autoplay playsinline></video>
        <video #localVideo class="local-video" autoplay muted playsinline></video>
        <div class="call-controls">
          <ion-button color="danger" (click)="endVideoCall()" aria-label="End video call">
            <ion-icon slot="icon-only" name="call"></ion-icon>
          </ion-button>
        </div>
      </div>
    }
    <ion-content #scroller class="chat-bg" [scrollEvents]="true" (ionScroll)="onScroll($event)">
      @if (loadingOlder()) {
        <div class="center"><ion-spinner name="crescent"></ion-spinner></div>
      }
      @if (visible().length === 0) {
        <app-empty-state title="No messages" subtitle="Say hello to start the conversation."></app-empty-state>
      }
      @for (row of visible(); track row.msg.id) {
        @if (row.sep) {
          <div class="day">{{ row.sep }}</div>
        }
        <ion-item-sliding>
          <app-message-bubble
            [message]="row.msg"
            [mine]="row.msg.senderId === uid"
            [showName]="isGroup && row.msg.senderId !== uid && !row.msg.deletedForAll"
            [senderName]="nameOf(row.msg.senderId)"
            [nameColor]="colorFromName(nameOf(row.msg.senderId))"
            [ticks]="ticks(row.msg)"
            (open)="onOpen($event)"
            (menu)="actions($event)"
          ></app-message-bubble>
          <ion-item-options side="start">
            <ion-item-option color="medium" (click)="reply(row.msg)">Reply</ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      }
    </ion-content>
    @if (viewer()) {
      <div class="viewer">
        <app-image-viewer [src]="viewer()!" (closed)="viewer.set(null)"></app-image-viewer>
      </div>
    }
    @if (chat()?.type !== 'broadcast' || auth.isAdmin()) {
      <ion-footer class="composer">
        @if (replyTo(); as r) {
          <div class="reply-bar">
            Replying to {{ r.senderName }}: {{ r.text }}
            <button type="button" (click)="replyTo.set(null)">×</button>
          </div>
        }
        @if (emojiOn()) {
          <div class="emojis" role="listbox" aria-label="Emoji picker">
            @for (e of emojis; track e) {
              <button type="button" (click)="draft += e">{{ e }}</button>
            }
          </div>
        }
        <div class="row">
          <ion-button fill="clear" color="light" (click)="emojiOn.set(!emojiOn())" aria-label="Emoji">
            <ion-icon slot="icon-only" name="happy"></ion-icon>
          </ion-button>
          <ion-button fill="clear" color="light" (click)="pickImage()" aria-label="Attach photo">
            <ion-icon slot="icon-only" name="attach"></ion-icon>
          </ion-button>
          <textarea
            rows="1"
            [(ngModel)]="draft"
            (ngModelChange)="onType()"
            (keydown.enter)="onEnter($event)"
            placeholder="Message"
            aria-label="Message"
          ></textarea>
          <ion-button fill="clear" color="light" (click)="send()" aria-label="Send">
            <ion-icon slot="icon-only" name="send"></ion-icon>
          </ion-button>
        </div>
      </ion-footer>
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex: 1;
        cursor: pointer;
      }
      .head > div:last-child {
        min-width: 0;
      }
      app-avatar {
        --av-size: 36px;
      }
      .t {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .s {
        font-size: 12px;
        opacity: 0.85;
      }
      .day {
        text-align: center;
        font-size: 12px;
        margin: 10px auto;
        background: color-mix(in srgb, var(--fc-panel) 88%, var(--fc-text) 10%);
        width: fit-content;
        padding: 4px 10px;
        border-radius: 8px;
      }
      .composer {
        background: var(--fc-header);
        padding: 6px;
        padding-bottom: calc(6px + env(safe-area-inset-bottom));
      }
      .row {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        max-width: 980px;
        margin: 0 auto;
      }
      textarea {
        flex: 1;
        resize: none;
        border: 0;
        border-radius: 20px;
        padding: 10px 12px;
        max-height: 120px;
        min-height: 40px;
        font: inherit;
        background: var(--fc-composer);
        color: var(--fc-text);
        outline: 0;
      }
      .reply-bar,
      .emojis {
        background: color-mix(in srgb, var(--fc-overlay) 70%, var(--fc-header));
        color: var(--fc-on-header);
        padding: 6px 10px;
        font-size: 13px;
      }
      .emojis button {
        font-size: 22px;
        background: none;
        border: 0;
      }
      .viewer {
        position: fixed;
        inset: 0;
        z-index: 20;
        background: #000;
      }
      .call-panel {
        position: fixed;
        inset: 0;
        z-index: 40;
        background: #101820;
      }
      .remote-video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .local-video {
        position: absolute;
        top: 18px;
        right: 18px;
        width: 112px;
        height: 160px;
        object-fit: cover;
        border: 2px solid #fff;
        border-radius: 10px;
        background: #26343d;
      }
      .call-controls {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 28px;
        display: flex;
        justify-content: center;
      }
      .chat-error {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: color-mix(in srgb, var(--ion-color-danger) 14%, var(--fc-panel));
        color: var(--fc-text);
        font-size: 13px;
      }
      .chat-error span {
        flex: 1;
      }
      .center {
        text-align: center;
        padding: 8px;
      }
      @media (min-width: 760px) {
        .composer {
          padding-inline: 20px;
        }
      }
      @media (max-width: 420px) {
        .head {
          gap: 6px;
        }
        app-avatar {
          --av-size: 32px;
        }
        .s {
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .row {
          gap: 1px;
        }
        .row ion-button {
          --padding-start: 4px;
          --padding-end: 4px;
          margin: 0;
        }
        textarea {
          min-width: 0;
          padding-inline: 10px;
        }
      }
    `,
  ],
})
export class ChatRoomPage implements OnDestroy {
  @ViewChild('scroller') scroller?: IonContent;
  @ViewChild('localVideo') localVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo?: ElementRef<HTMLVideoElement>;

  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chats = inject(ChatRepo);
  private readonly users = inject(UserRepo);
  private readonly notify = inject(NotifyService);
  private readonly sockets = inject(SocketService);
  private readonly sheets = inject(ActionSheetController);

  readonly chat = signal<Chat | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly searching = signal(false);
  readonly loadingOlder = signal(false);
  readonly emojiOn = signal(false);
  readonly replyTo = signal<ReplyTo | null>(null);
  readonly viewer = signal<string | null>(null);
  readonly typingIds = signal<string[]>([]);
  readonly muted = signal(false);
  readonly callOn = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly colorFromName = colorFromName;
  readonly emojis = EMOJIS;
  query = '';
  draft = '';
  uid = '';
  isGroup = false;
  private chatId = '';
  private unsubs: Array<() => void> = [];
  private oldest: string | null = null;
  private hasMore = true;
  private stickToBottom = true;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private localPending: ChatMessage[] = [];
  private peer: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;

  constructor() {
    addIcons({ arrowBack, informationCircle, send, attach, happy, ellipsisVertical, videocam, call, close });
    this.uid = this.auth.uid();
    this.chatId = this.route.snapshot.paramMap.get('id') ?? '';
    this.notify.setOpenChat(this.chatId);
    this.muted.set((this.auth.profile()?.mutedChats ?? []).includes(this.chatId));
    void this.boot();
  }

  ngOnDestroy(): void {
    this.notify.setOpenChat(null);
    for (const u of this.unsubs) {
      u();
    }
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }
    this.endVideoCall(false);
  }

  visible(): { msg: ChatMessage; sep: string }[] {
    const uid = this.uid;
    const q = this.query.trim().toLowerCase();
    const merged = [...this.messages().filter((m) => !m.deletedFor.includes(uid))];
    for (const p of this.localPending) {
      if (!merged.some((m) => m.clientId === p.clientId)) {
        merged.push(p);
      }
    }
    const filtered = q
      ? merged.filter((m) => m.text.toLowerCase().includes(q) || m.type === 'image')
      : merged;
    const rows: { msg: ChatMessage; sep: string }[] = [];
    let last = '';
    for (const msg of filtered) {
      const key = dayKey(msg.createdAt);
      const sep = key && key !== last ? formatDayLabel(msg.createdAt) : '';
      if (key) {
        last = key;
      }
      rows.push({ msg, sep });
    }
    return rows;
  }

  title(): string {
    const chat = this.chat();
    if (!chat) {
      return '';
    }
    if (chat.type !== 'private') {
      return chat.name || 'Group';
    }
    const other = chat.members.find((id) => id !== this.uid);
    return other ? this.users.displayName(other, 'Friend') : 'Chat';
  }

  photo(): string {
    const chat = this.chat();
    if (!chat) {
      return '';
    }
    if (chat.avatar) {
      return chat.avatar;
    }
    if (chat.type !== 'private') {
      return '';
    }
    const other = chat.members.find((id) => id !== this.uid);
    return other ? (this.users.cache().get(other)?.avatar ?? '') : '';
  }

  subtitle(): string {
    if (this.typingIds().length) {
      const names = this.typingIds().map((id) => this.nameOf(id)).join(', ');
      return `${names} typing…`;
    }
    const chat = this.chat();
    if (!chat) {
      return '';
    }
    if (chat.type === 'group') {
      return `${chat.members.length} members`;
    }
    if (chat.type === 'broadcast') {
      return 'Official announcements';
    }
    const other = chat.members.find((id) => id !== this.uid);
    const user = other ? this.users.cache().get(other) : undefined;
    return formatLastSeen(user?.lastSeen ?? null, isUserOnline(user?.lastSeen ?? null));
  }

  nameOf(uid: string): string {
    return this.users.displayName(uid, 'Someone');
  }

  ticks(msg: ChatMessage): 'sent' | 'delivered' | 'read' {
    if (msg.pending) {
      return 'sent';
    }
    const others = (this.chat()?.members ?? []).filter((id) => id !== this.uid);
    if (others.length && others.every((id) => msg.readBy.includes(id))) {
      return 'read';
    }
    if (others.length && others.every((id) => msg.deliveredTo.includes(id))) {
      return 'delivered';
    }
    if (msg.deliveredTo.some((id) => id !== this.uid) || msg.readBy.some((id) => id !== this.uid)) {
      return 'delivered';
    }
    return 'sent';
  }

  back(): void {
    void this.router.navigateByUrl('/tabs/chats');
  }

  info(): void {
    void this.router.navigate(['/group', this.chatId]);
  }

  maybeInfo(): void {
    if (this.chat()?.type === 'group') {
      this.info();
    }
  }

  async toggleMute(): Promise<void> {
    const next = !this.muted();
    this.muted.set(next);
    try {
      await this.users.setMuted(this.uid, this.chatId, next);
    } catch (err) {
      this.muted.set(!next);
      await this.notify.show(err instanceof Error ? err.message : 'Could not update mute', 'danger');
    }
  }

  onEnter(ev: Event): void {
    const e = ev as KeyboardEvent;
    if (!e.shiftKey) {
      e.preventDefault();
      void this.send();
    }
  }

  onType(): void {
    void this.chats.setTyping(this.chatId, this.uid);
  }

  async send(): Promise<void> {
    const text = this.draft.trim();
    if (!text || !this.chat()) {
      return;
    }
    this.draft = '';
    this.emojiOn.set(false);
    await this.dispatch('text', text);
  }

  async pickImage(): Promise<void> {
    try {
      const photo = await Camera.getPhoto({
        quality: 60,
        width: 800,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
      });
      if (!photo.dataUrl) {
        return;
      }
      const image = await compressChatImage(photo.dataUrl);
      await this.dispatch('image', this.draft.trim(), image);
      this.draft = '';
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('cancel')) {
        return;
      }
      await this.notify.show(err instanceof Error ? err.message : 'Could not send photo', 'danger');
    }
  }

  reply(msg: ChatMessage): void {
    this.replyTo.set({
      id: msg.id,
      text: msg.deletedForAll ? 'Deleted message' : msg.text || (msg.type === 'image' ? 'Photo' : ''),
      senderName: this.nameOf(msg.senderId),
    });
  }

  onOpen(msg: ChatMessage): void {
    if (msg.type === 'image' && msg.image && !msg.deletedForAll) {
      this.viewer.set(msg.image);
    }
  }

  async actions(msg: ChatMessage): Promise<void> {
    const buttons: Array<{ text: string; role?: string; handler?: () => void }> = [
      { text: 'Reply', handler: () => this.reply(msg) },
    ];
    for (const emoji of REACTIONS) {
      buttons.push({ text: `React ${emoji}`, handler: () => void this.chats.react(this.chatId, msg.id, emoji) });
    }
    if (msg.text && !msg.deletedForAll) {
      buttons.push({
        text: 'Copy',
        handler: () => void navigator.clipboard.writeText(msg.text),
      });
    }
    buttons.push({
      text: 'Delete for me',
      handler: () => void this.chats.deleteForMe(this.chatId, msg.id, this.uid),
    });
    if (msg.senderId === this.uid && !msg.deletedForAll) {
      buttons.push({
        text: 'Delete for everyone',
        role: 'destructive',
        handler: () => void this.chats.deleteForEveryone(this.chatId, msg.id),
      });
    }
    buttons.push({ text: 'Cancel', role: 'cancel' });
    const sheet = await this.sheets.create({ header: 'Message', buttons });
    await sheet.present();
  }

  async chatActions(chat: Chat): Promise<void> {
    const buttons: Array<{ text: string; role?: string; handler?: () => void }> = [
      {
        text: 'Clear chat',
        role: 'destructive',
        handler: () => {
          void this.chats.clearChat(this.chatId).then(() => this.messages.set([]));
        },
      },
    ];
    if (chat.type === 'group') {
      buttons.push({
        text: 'Leave group',
        role: 'destructive',
        handler: () => void this.leaveChat(),
      });
    } else if (chat.type === 'private') {
      buttons.push({
        text: 'Delete chat for me',
        role: 'destructive',
        handler: () => void this.leaveChat(),
      });
    }
    buttons.push({ text: 'Cancel', role: 'cancel' });
    const sheet = await this.sheets.create({ header: 'Chat options', buttons });
    await sheet.present();
  }

  private async leaveChat(): Promise<void> {
    await this.chats.leaveChat(this.chatId);
    await this.router.navigateByUrl('/tabs/chats');
  }

  async onScroll(ev: CustomEvent): Promise<void> {
    const detail = ev.detail as { scrollTop: number; scrollHeight: number; clientHeight: number };
    const top = detail.scrollTop;
    this.stickToBottom = detail.scrollHeight - (top + detail.clientHeight) < 120;
    if (top < 80 && this.hasMore && !this.loadingOlder() && this.oldest) {
      this.loadingOlder.set(true);
      try {
        const { messages, last } = await this.chats.loadOlder(this.chatId, this.oldest);
        if (messages.length === 0) {
          this.hasMore = false;
        } else {
          this.oldest = last;
          this.messages.set([...messages, ...this.messages()]);
        }
      } finally {
        this.loadingOlder.set(false);
      }
    }
  }

  private async boot(): Promise<void> {
    await this.users.loadActiveUsers();
    this.unsubs.push(
      this.chats.listenChat(this.chatId, (c) => {
        this.chat.set(c);
        this.isGroup = c?.type === 'group';
      }, (error) => this.handleLoadError(error)),
    );
    this.unsubs.push(
      this.chats.listenLatestMessages(this.chatId, (msgs, oldestId) => {
        const shouldScroll = this.stickToBottom;
        const liveIds = new Set(msgs.map((m) => m.id));
        const older = this.messages().filter((m) => !liveIds.has(m.id) && !m.pending);
        this.messages.set([...older, ...msgs]);
        if (!this.oldest && oldestId) {
          this.oldest = oldestId;
        }
        this.localPending = this.localPending.filter((p) => !msgs.some((m) => m.clientId === p.clientId));
        void this.acknowledge(msgs);
        if (shouldScroll) {
          queueMicrotask(() => void this.scroller?.scrollToBottom(300));
        }
      }, (error) => this.handleLoadError(error), (message) => this.receiveMessage(message)),
    );
    this.unsubs.push(
      this.chats.listenTyping(this.chatId, this.uid, (ids) => this.typingIds.set(ids)),
    );
    this.unsubs.push(
      this.sockets.on<{ chatId: string; from: string; kind: string; signal: RTCSessionDescriptionInit | RTCIceCandidateInit }>(
        'call:signal',
        (payload) => {
          if (payload.chatId === this.chatId) void this.handleCallSignal(payload);
        },
      ),
    );
    try {
      await this.chats.clearUnread(this.chatId, this.uid);
    } catch {
      // offline ok
    }
  }

  retryLoad(): void {
    for (const unsubscribe of this.unsubs) {
      unsubscribe();
    }
    this.unsubs = [];
    this.loadError.set(null);
    void this.boot();
  }

  private handleLoadError(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) {
      return;
    }
    const message = error instanceof ApiError && error.status === 403
      ? 'You are no longer a member of this chat.'
      : error instanceof ApiError && error.status === 404
        ? 'This chat is no longer available.'
        : error instanceof Error
          ? error.message
          : 'Could not load this chat. Check your connection.';
    this.loadError.set(message);
    void this.notify.show(message, 'danger');
  }

  private receiveMessage(message: ChatMessage): void {
    const current = this.messages();
    const index = current.findIndex((item) => item.id === message.id || item.clientId === message.clientId);
    const next = [...current];
    if (index >= 0) {
      next[index] = message;
    } else {
      next.push(message);
    }
    next.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    this.messages.set(next);
    this.localPending = this.localPending.filter((pending) => pending.clientId !== message.clientId);
    void this.acknowledge([message]);
    if (this.stickToBottom) {
      queueMicrotask(() => void this.scroller?.scrollToBottom(180));
    }
  }

  async startVideoCall(): Promise<void> {
    try {
      await this.openMedia();
      this.createPeer();
      const offer = await this.peer!.createOffer();
      await this.peer!.setLocalDescription(offer);
      this.sendCall('offer', offer);
    } catch {
      this.endVideoCall();
      await this.notify.show('Camera and microphone permission is required for video calls.', 'danger');
    }
  }

  private async handleCallSignal(payload: { kind: string; signal: RTCSessionDescriptionInit | RTCIceCandidateInit }): Promise<void> {
    if (payload.kind === 'hangup') {
      this.endVideoCall(false);
      return;
    }
    try {
      await this.openMedia();
      this.createPeer();
      if (payload.kind === 'offer') {
        await this.peer!.setRemoteDescription(payload.signal as RTCSessionDescriptionInit);
        const answer = await this.peer!.createAnswer();
        await this.peer!.setLocalDescription(answer);
        this.sendCall('answer', answer);
      } else if (payload.kind === 'answer') {
        await this.peer!.setRemoteDescription(payload.signal as RTCSessionDescriptionInit);
      } else if (payload.kind === 'candidate') {
        await this.peer!.addIceCandidate(payload.signal as RTCIceCandidateInit);
      }
    } catch {
      this.endVideoCall();
      await this.notify.show('Could not connect the video call.', 'danger');
    }
  }

  private async openMedia(): Promise<void> {
    if (!this.localStream) {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
    this.callOn.set(true);
    queueMicrotask(() => {
      if (this.localVideo) this.localVideo.nativeElement.srcObject = this.localStream;
    });
  }

  private createPeer(): void {
    if (this.peer) return;
    this.peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.localStream?.getTracks().forEach((track) => this.peer?.addTrack(track, this.localStream!));
    this.peer.onicecandidate = (event) => {
      if (event.candidate) this.sendCall('candidate', event.candidate.toJSON());
    };
    this.peer.ontrack = (event) => {
      if (this.remoteVideo) this.remoteVideo.nativeElement.srcObject = event.streams[0];
    };
  }

  private sendCall(kind: string, signal: unknown): void {
    this.sockets.emit('call:signal', { chatId: this.chatId, kind, signal });
  }

  endVideoCall(notifyPeer = true): void {
    if (notifyPeer && this.peer) this.sendCall('hangup', null);
    this.peer?.close();
    this.peer = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.callOn.set(false);
  }

  private async acknowledge(msgs: ChatMessage[]): Promise<void> {
    const others = msgs.filter((m) => m.senderId !== this.uid && !m.deletedFor.includes(this.uid));
    const toDeliver = others.filter((m) => !m.deliveredTo.includes(this.uid)).map((m) => m.id);
    const toRead = others.filter((m) => !m.readBy.includes(this.uid)).map((m) => m.id);
    try {
      await this.chats.markDelivered(this.chatId, toDeliver, this.uid);
      await this.chats.markRead(this.chatId, toRead, this.uid);
      await this.chats.clearUnread(this.chatId, this.uid);
    } catch {
      // rules or offline
    }
  }

  private async dispatch(type: 'text' | 'image', text: string, image = ''): Promise<void> {
    const chat = this.chat();
    if (!chat) {
      return;
    }
    const clientId = `${this.uid}-${Date.now()}`;
    const pending: ChatMessage = {
      id: clientId,
      senderId: this.uid,
      type,
      text,
      image,
      replyTo: this.replyTo(),
      createdAt: null,
      deliveredTo: [this.uid],
      readBy: [this.uid],
      reactions: {},
      deletedFor: [],
      deletedForAll: false,
      clientId,
      pending: true,
    };
    this.localPending = [...this.localPending, pending];
    this.replyTo.set(null);
    try {
      await this.chats.sendMessage({
        chatId: this.chatId,
        senderId: this.uid,
        type,
        text,
        image,
        replyTo: pending.replyTo,
        clientId,
        memberIds: chat.members,
      });
    } catch (err) {
      this.localPending = this.localPending.filter((m) => m.clientId !== clientId);
      await this.notify.show(err instanceof Error ? err.message : 'Could not send', 'danger');
    }
  }
}
