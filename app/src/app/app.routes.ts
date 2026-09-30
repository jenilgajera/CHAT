import { Routes } from '@angular/router';
import { adminGuard, authGuard, disabledGuard, pendingGuard, publicGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth.page').then((m) => m.AuthPage),
    canActivate: [publicGuard],
  },
  {
    path: 'pending',
    loadComponent: () => import('./features/auth/status.page').then((m) => m.StatusPage),
    canActivate: [pendingGuard],
  },
  {
    path: 'disabled',
    loadComponent: () => import('./features/auth/status.page').then((m) => m.StatusPage),
    canActivate: [disabledGuard],
  },
  {
    path: 'tabs',
    loadComponent: () => import('./features/tabs/tabs.page').then((m) => m.TabsPage),
    canActivate: [authGuard],
    children: [
      {
        path: 'chats',
        loadComponent: () => import('./features/chats/chats.page').then((m) => m.ChatsPage),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: 'admin',
        loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage),
        canActivate: [adminGuard],
      },
      { path: '', redirectTo: 'chats', pathMatch: 'full' },
    ],
  },
  {
    path: 'chat/:id',
    loadComponent: () => import('./features/chat-room/chat-room.page').then((m) => m.ChatRoomPage),
    canActivate: [authGuard],
  },
  {
    path: 'new-chat',
    loadComponent: () => import('./features/new-chat/new-chat.page').then((m) => m.NewChatPage),
    canActivate: [authGuard],
  },
  {
    path: 'group/:id',
    loadComponent: () => import('./features/group-info/group-info.page').then((m) => m.GroupInfoPage),
    canActivate: [authGuard],
  },
  { path: '', redirectTo: 'tabs/chats', pathMatch: 'full' },
  { path: '**', redirectTo: 'tabs/chats' },
];
