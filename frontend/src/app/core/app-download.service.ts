import { Injectable, signal } from '@angular/core';

export const APK_URL = '/download/mundopet.apk';
export type DownloadState = 'checking' | 'available' | 'unavailable';

/**
 * Verifica se o APK esta publicado (HEAD /download/mundopet.apk) antes de oferecer o botao.
 * Falha segura: 404, erro de rede ou timeout => "Em breve", nunca um link quebrado.
 */
@Injectable({ providedIn: 'root' })
export class AppDownloadService {
  readonly state = signal<DownloadState>('checking');
  readonly sizeMb = signal<number | null>(null);
  private checked = false;

  async check(timeoutMs = 5000): Promise<DownloadState> {
    if (this.checked) return this.state();
    this.checked = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(APK_URL, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
      const type = res.headers.get('content-type') ?? '';
      // o fallback da SPA devolve index.html (200 text/html): isso NAO e o APK
      if (res.ok && !type.includes('text/html')) {
        const bytes = Number(res.headers.get('content-length'));
        this.sizeMb.set(bytes > 0 ? Math.round((bytes / 1048576) * 10) / 10 : null);
        this.state.set('available');
      } else {
        this.state.set('unavailable');
      }
    } catch {
      this.state.set('unavailable');
    } finally {
      clearTimeout(timer);
    }
    return this.state();
  }
}
