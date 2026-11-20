import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mundopet-theme';
const META_COLORS: Record<Theme, string> = { dark: '#0b0908', light: '#faf6ef' };

/**
 * Tema claro/escuro. Ordem de escolha: preferencia salva > preferencia do sistema > escuro.
 * Aplica data-theme no <html> (o index.html faz o mesmo antes do Angular subir, evitando "piscar").
 * Falha segura: se o localStorage estiver bloqueado (aba anonima, cookies off) o tema funciona so na sessao.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    effect(() => this.apply(this.theme()));
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // armazenamento indisponivel: segue so em memoria
    }
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignora e cai na preferencia do sistema
    }
    const view = this.doc.defaultView;
    if (view && typeof view.matchMedia === 'function' && view.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  private apply(theme: Theme): void {
    const root = this.doc.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme]);
  }
}
