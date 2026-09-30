import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  const gate = auth.gate();
  if (gate === 'active') {
    return true;
  }
  if (gate === 'pending') {
    return router.parseUrl('/pending');
  }
  if (gate === 'disabled') {
    return router.parseUrl('/disabled');
  }
  return router.parseUrl('/auth');
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.isAdmin()) {
    return true;
  }
  if (auth.gate() === 'active') {
    return router.parseUrl('/tabs/chats');
  }
  return router.parseUrl('/auth');
};

export const publicGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  const gate = auth.gate();
  if (gate === 'active') {
    return router.parseUrl('/tabs/chats');
  }
  if (gate === 'pending') {
    return router.parseUrl('/pending');
  }
  if (gate === 'disabled') {
    return router.parseUrl('/disabled');
  }
  return true;
};

export const pendingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.gate() === 'pending') {
    return true;
  }
  if (auth.gate() === 'disabled') {
    return router.parseUrl('/disabled');
  }
  if (auth.gate() === 'active') {
    return router.parseUrl('/tabs/chats');
  }
  return router.parseUrl('/auth');
};

export const disabledGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.gate() === 'disabled') {
    return true;
  }
  if (auth.gate() === 'pending') {
    return router.parseUrl('/pending');
  }
  if (auth.gate() === 'active') {
    return router.parseUrl('/tabs/chats');
  }
  return router.parseUrl('/auth');
};
