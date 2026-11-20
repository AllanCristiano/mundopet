import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

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

  it('sessao da area administrativa: entra, guarda so na aba e sai com aviso', () => {
    const session = TestBed.inject(AdminSession);
    let error = '';
    session.login('errado').subscribe({ error: (e: Error) => (error = e.message) });
    http.expectOne('/api/site/admin/check').flush({ detail: 'Token inválido' }, { status: 401, statusText: 'x' });
    expect(error).toBe('Token inválido');
    expect(session.token()).toBe('');

    session.login('certo').subscribe();
    const req = http.expectOne('/api/site/admin/check');
    expect(req.request.headers.get(ADMIN_HEADER)).toBe('certo');
    req.flush(null);
    expect(session.token()).toBe('certo');
    expect(sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBe('certo');
    expect(session.headers().headers.get(ADMIN_HEADER)).toBe('certo');

    session.logout('Sessão expirada');
    expect(session.token()).toBe('');
    expect(session.notice()).toBe('Sessão expirada');
    expect(sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
  });

  it('armazenamento bloqueado nao quebra a sessao', () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('bloqueado');
    spyOn(Storage.prototype, 'removeItem').and.throwError('bloqueado');
    const session = TestBed.inject(AdminSession);
    session.login('x').subscribe();
    http.expectOne('/api/site/admin/check').flush(null);
    expect(session.token()).toBe('x');
    expect(() => session.logout()).not.toThrow();
    // o afterEach limpa a sessao: libera o armazenamento de novo
    (Storage.prototype.setItem as jasmine.Spy).and.callThrough();
    (Storage.prototype.removeItem as jasmine.Spy).and.callThrough();
  });
});
