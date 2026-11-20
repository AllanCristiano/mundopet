import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { AdminLogin } from './admin-login';
import { ADMIN_HEADER, ADMIN_TOKEN_KEY, AdminSession } from './admin-session';
import { DEFAULT_SITE, SITE_API, SiteConfigService, mergeSettings, waLink } from './site-config';

describe('Configuracao do site', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  });

  it('padroes = textos que o site ja tinha', () => {
    expect(DEFAULT_SITE.chapters.map((c) => c.id)).toEqual(['hotel', 'racoes', 'beleza', 'veterinario']);
    expect(DEFAULT_SITE.hero.highlight).toBe('merece');
    expect(DEFAULT_SITE.stats.find((s) => s.source === 'RATING')!.label).toContain('avalia');
  });

  it('mescla com os padroes: campo faltando ou de tipo errado usa o padrao; respeita a ordem do dono', () => {
    const m = mergeSettings({
      store: { name: 'PetLand', whatsapp: 123 } as never,
      chapters: [
        { ...DEFAULT_SITE.chapters[3], enabled: false, features: ['A', 7 as never] },
        { id: 'hotel', title: 'Hotel novo' } as never,
      ],
      stats: [{ label: 'clientes', value: 10 } as never],
      address: 'quebrado' as never,
    });
    expect(m.store.name).toBe('PetLand');
    expect(m.store.whatsapp).toBe(DEFAULT_SITE.store.whatsapp);
    expect(m.chapters.map((c) => c.id)).toEqual(['veterinario', 'hotel', 'racoes', 'beleza']);
    expect(m.chapters[0].enabled).toBeFalse();
    expect(m.chapters[0].features).toEqual(['A']);
    expect(m.chapters[1].title).toBe('Hotel novo');
    expect(m.chapters[1].features).toEqual(DEFAULT_SITE.chapters[0].features);
    expect(m.stats.length).toBe(1);
    expect(m.stats[0].label).toBe('clientes');
    expect(m.stats[0].source).toBe('MANUAL');
    expect(m.address).toEqual(DEFAULT_SITE.address);
    expect(mergeSettings(null)).toEqual(DEFAULT_SITE);
  });

  it('link do WhatsApp so com digitos e texto codificado', () => {
    expect(waLink('+55 (11) 9999-8888', 'Olá & tchau')).toBe('https://wa.me/551199998888?text=Ol%C3%A1%20%26%20tchau');
  });

  it('servico: aplica o que o dono salvou (capitulos numerados, menu sem o desligado)', () => {
    const site = TestBed.inject(SiteConfigService);
    const s = structuredClone(DEFAULT_SITE);
    s.chapters[0].enabled = false;
    s.store.whatsapp = '5511900001111';
    site.apply({ version: 7, settings: s, updatedAt: '2026-11-20T10:00:00Z' });
    expect(site.version()).toBe(7);
    expect(site.chapters().map((c) => [c.id, c.number, c.scene])).toEqual([
      ['racoes', '01', 'food'], ['beleza', '02', 'beauty'], ['veterinario', '03', 'vet'],
    ]);
    expect(site.navLinks().map((l) => l.href)).not.toContain('#hotel');
    expect(site.navLinks().map((l) => l.href)).toContain('/racoes');
    expect(site.whatsappUrl()).toContain('wa.me/5511900001111');
    expect(site.whatsappLink('oi')).toBe('https://wa.me/5511900001111?text=oi');
    expect(site.store().street).toBe(DEFAULT_SITE.address.street);
  });

  it('load: aplica a resposta; erro ou demora segue com os padroes (o site nunca trava)', fakeAsync(() => {
    const site = TestBed.inject(SiteConfigService);
    let done = false;
    site.load().then(() => (done = true));
    const s = structuredClone(DEFAULT_SITE);
    s.hero.title = 'Novo título';
    http.expectOne(SITE_API).flush({ version: 2, settings: s, updatedAt: null });
    tick();
    expect(done).toBeTrue();
    expect(site.settings().hero.title).toBe('Novo título');

    done = false;
    site.load().then(() => (done = true));
    http.expectOne(SITE_API).flush('', { status: 503, statusText: 'x' });
    tick();
    expect(done).toBeTrue();
    expect(site.settings().hero.title).toBe('Novo título');

    done = false;
    site.load(100).then(() => (done = true));
    const slow = http.expectOne(SITE_API);
    tick(150);
    expect(done).toBeTrue();
    expect(slow.cancelled).toBeTrue();
  }));

  it('sessao da area administrativa: login e senha, guarda so na aba, sai encerrando no servidor', () => {
    const session = TestBed.inject(AdminSession);
    let error = '';
    session.login(' dono ', 'errada').subscribe({ error: (e: Error) => (error = e.message) });
    const bad = http.expectOne('/api/admin/login');
    expect(bad.request.body).toEqual({ username: 'dono', password: 'errada' });
    bad.flush({ detail: 'Login ou senha inválidos' }, { status: 401, statusText: 'x' });
    expect(error).toBe('Login ou senha inválidos');
    expect(session.token()).toBe('');

    session.login('dono', 'certa').subscribe();
    http.expectOne('/api/admin/login').flush({ token: 'tok-1', username: 'dono', demo: false, expiresInSeconds: 60 });
    expect(session.token()).toBe('tok-1');
    expect(session.username()).toBe('dono');
    expect(sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBe('tok-1');
    expect(session.headers().headers.get(ADMIN_HEADER)).toBe('tok-1');

    session.logout();
    const del = http.expectOne('/api/admin/session');
    expect(del.request.method).toBe('DELETE');
    expect(del.request.headers.get(ADMIN_HEADER)).toBe('tok-1');
    del.flush('', { status: 503, statusText: 'x' }); // servidor fora: sai mesmo assim
    expect(session.token()).toBe('');
    expect(sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();

    // sessao expirada: so limpa e avisa (nao chama o servidor)
    session.token.set('velho');
    session.logout('Sessão expirada');
    http.expectNone('/api/admin/session');
    expect(session.notice()).toBe('Sessão expirada');
  });

  it('modo da area: le do servidor; se falhar, pede login e senha', () => {
    const session = TestBed.inject(AdminSession);
    let mode: unknown;
    session.mode().subscribe((m) => (mode = m));
    http.expectOne('/api/admin/mode').flush({ enabled: true, demo: true });
    expect(mode).toEqual({ enabled: true, demo: true });
    session.mode().subscribe((m) => (mode = m));
    http.expectOne('/api/admin/mode').flush('', { status: 500, statusText: 'x' });
    expect(mode).toEqual({ enabled: true, demo: false });
  });

  it('tela de login: fora do modo demo exige login e senha; mostra/esconde a senha; area desligada avisa', () => {
    const f = TestBed.createComponent(AdminLogin);
    f.componentRef.setInput('title', 'Gestão do');
    f.detectChanges();
    http.expectOne('/api/admin/mode').flush({ enabled: false, demo: false });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')!.textContent).toContain('Gestão do');
    expect(el.querySelector('.error')!.textContent).toContain('ADMIN_PASSWORD');
    expect(el.querySelector('.demo')).toBeNull();
    const submit = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(submit.disabled).toBeTrue();

    const pass = el.querySelector<HTMLInputElement>('input[name=password]')!;
    expect(pass.type).toBe('password');
    el.querySelector<HTMLButtonElement>('.eye')!.click();
    f.detectChanges();
    expect(pass.type).toBe('text');

    for (const [name, value] of [['username', 'dono'], ['password', 'x']]) {
      const i = el.querySelector<HTMLInputElement>(`input[name=${name}]`)!;
      i.value = value;
      i.dispatchEvent(new Event('input'));
    }
    f.detectChanges();
    expect(submit.disabled).toBeFalse();
    let done = false;
    f.componentInstance.done.subscribe(() => (done = true));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    el.querySelector('form')!.dispatchEvent(new Event('submit')); // clique duplo nao manda duas vezes
    http.expectOne('/api/admin/login').flush({ token: 't', username: 'dono', demo: false, expiresInSeconds: 1 });
    expect(done).toBeTrue();
    expect(f.componentInstance.password()).toBe('');
  });

  it('armazenamento bloqueado nao quebra a sessao', () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('bloqueado');
    spyOn(Storage.prototype, 'removeItem').and.throwError('bloqueado');
    const session = TestBed.inject(AdminSession);
    session.login('', '').subscribe();
    http.expectOne('/api/admin/login').flush({ token: 'x', username: 'demonstração', demo: true, expiresInSeconds: 1 });
    expect(session.token()).toBe('x');
    expect(() => session.logout()).not.toThrow();
    http.expectOne('/api/admin/session').flush(null);
    // o afterEach limpa a sessao: libera o armazenamento de novo
    (Storage.prototype.setItem as jasmine.Spy).and.callThrough();
    (Storage.prototype.removeItem as jasmine.Spy).and.callThrough();
  });
});
