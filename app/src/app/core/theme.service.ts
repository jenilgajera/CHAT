import { Injectable, signal } from '@angular/core';
import { ThemePref } from '../data/models';

const KEY = 'friendschat.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePref>(this.read());

  apply(pref: ThemePref): void {
    this.preference.set(pref);
    localStorage.setItem(KEY, pref);
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark', 'theme-system');
    root.classList.add(`theme-${pref}`);
    this.syncIonicPalette(pref);
  }

  init(): void {
    this.apply(this.preference());
  }

  private read(): ThemePref {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') {
      return v;
    }
    return 'system';
  }

  private syncIonicPalette(pref: ThemePref): void {
    const dark =
      pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ion-palette-dark', dark);
  }
}
