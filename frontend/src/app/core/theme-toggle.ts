import { Component, computed, inject } from '@angular/core';

import { ThemeService } from './theme.service';

/** Botao sol/lua. O icone gira e "eclipsa" ao trocar de tema. */
@Component({
  selector: 'app-theme-toggle',
  template: `
    <button type="button" (click)="theme.toggle()" [attr.aria-label]="label()" [attr.title]="label()">
      <span class="icons" [class.dark]="isDark()" aria-hidden="true">
        <!-- sol: mostrado no tema claro -->
        <svg class="sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
        <!-- lua: mostrada no tema escuro -->
        <svg class="moon" viewBox="0 0 24 24">
          <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7z" />
        </svg>
      </span>
    </button>
  `,
  styles: `
    button {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border: 1px solid var(--line);
      border-radius: 50%;
      background: transparent;
      color: var(--ink);
      cursor: pointer;
      transition: border-color .3s, transform .3s var(--ease-out);
    }
    button:hover { border-color: var(--gold); }
    button:active { transform: scale(.92); }
    .icons { position: relative; width: 22px; height: 22px; }
    svg {
      position: absolute; inset: 0; width: 100%; height: 100%;
      fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
      transition: opacity .5s, transform .7s var(--ease-out);
    }
    .sun circle { fill: currentColor; }
    .moon { fill: currentColor; stroke: none; opacity: 0; transform: rotate(-90deg) scale(.4); }
    .dark .sun { opacity: 0; transform: rotate(90deg) scale(.4); }
    .dark .moon { opacity: 1; transform: none; }
  `,
})
export class ThemeToggle {
  readonly theme = inject(ThemeService);
  readonly isDark = computed(() => this.theme.theme() === 'dark');
  readonly label = computed(() => (this.isDark() ? 'Ativar tema claro' : 'Ativar tema escuro'));
}
