import { TestBed } from '@angular/core/testing';

import { APK_URL, AppDownloadService } from './app-download.service';
import { ThemeToggle } from './theme-toggle';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    root.removeAttribute('data-theme');
  });

  afterEach(() => localStorage.removeItem(THEME_STORAGE_KEY));

  function create() {
    const service = TestBed.inject(ThemeService);
    TestBed.tick(); // roda o effect que aplica o tema
    return service;
  }

  it('usa o tema salvo pelo usuario', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(create().theme()).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('sem preferencia salva segue o sistema (claro)', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    expect(create().theme()).toBe('light');
  });

  it('sem preferencia salva e sistema escuro => escuro', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    expect(create().theme()).toBe('dark');
  });

  it('ignora valor invalido salvo', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'roxo');
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    expect(create().theme()).toBe('dark');
  });

  it('toggle alterna, persiste e atualiza <html> e theme-color', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const service = create();

    service.toggle();
    TestBed.tick();
    expect(service.theme()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(meta.getAttribute('content')).toBe('#faf6ef');
    meta.remove();
  });

  it('falha segura: localStorage bloqueado nao quebra o tema', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceeded');
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    const service = create();
    expect(service.theme()).toBe('dark');
    expect(() => service.toggle()).not.toThrow();
    TestBed.tick();
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('botao alterna o tema e atualiza o rotulo acessivel', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const fixture = TestBed.createComponent(ThemeToggle);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Ativar tema claro');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Ativar tema escuro');
  });
});

describe('AppDownloadService', () => {
  function respond(status: number, headers: Record<string, string> = {}) {
    return spyOn(window, 'fetch').and.resolveTo(new Response(null, { status, headers }));
  }

  it('APK publicado => disponivel com tamanho em MB', async () => {
    const fetchSpy = respond(200, {
      'content-type': 'application/vnd.android.package-archive',
      'content-length': String(21 * 1048576),
    });
    const service = TestBed.inject(AppDownloadService);
    expect(await service.check()).toBe('available');
    expect(service.sizeMb()).toBe(21);
    expect(fetchSpy.calls.mostRecent().args[0]).toBe(APK_URL);
    expect((fetchSpy.calls.mostRecent().args[1] as RequestInit).method).toBe('HEAD');
  });

  it('sem content-length continua disponivel, sem tamanho', async () => {
    respond(200, { 'content-type': 'application/octet-stream' });
    const service = TestBed.inject(AppDownloadService);
    expect(await service.check()).toBe('available');
    expect(service.sizeMb()).toBeNull();
  });

  it('404 => em breve', async () => {
    respond(404);
    expect(await TestBed.inject(AppDownloadService).check()).toBe('unavailable');
  });

  it('fallback da SPA (200 text/html) NAO conta como APK', async () => {
    respond(200, { 'content-type': 'text/html' });
    expect(await TestBed.inject(AppDownloadService).check()).toBe('unavailable');
  });

  it('erro de rede => em breve', async () => {
    spyOn(window, 'fetch').and.rejectWith(new TypeError('Failed to fetch'));
    expect(await TestBed.inject(AppDownloadService).check()).toBe('unavailable');
  });

  it('servidor que nao responde => timeout => em breve', async () => {
    spyOn(window, 'fetch').and.callFake(
      (_url, init) =>
        new Promise((_, reject) =>
          (init as RequestInit).signal!.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError'))),
        ),
    );
    expect(await TestBed.inject(AppDownloadService).check(10)).toBe('unavailable');
  });

  it('verifica uma unica vez', async () => {
    const fetchSpy = respond(404);
    const service = TestBed.inject(AppDownloadService);
    await service.check();
    await service.check();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
