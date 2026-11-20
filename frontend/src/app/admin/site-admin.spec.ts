import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ADMIN_HEADER, ADMIN_TOKEN_KEY } from '../core/admin-session';
import { DEFAULT_SITE, SITE_API, SiteConfigService, SiteSettings } from '../core/site-config';
import { SiteAdmin, parseCoords, validate } from './site-admin';

describe('Gestao do site', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.match('/api/admin/mode').forEach((r) => r.flush({ enabled: true, demo: false }));
    http.match('/api/admin/session').forEach((r) => r.flush(null));
    http.verify();
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  });

  // ---------------- regras ----------------

  it('valida campos principais como a API', () => {
    expect(validate(DEFAULT_SITE)).toEqual({});
    const s: SiteSettings = structuredClone(DEFAULT_SITE);
    s.store.whatsapp = '123';
    s.store.instagram = 'javascript:alert(1)';
    s.store.facebook = 'http://fb.com/x';
    s.store.email = 'nao-email';
    s.store.name = ' ';
    s.address.zip = '1';
    s.address.state = 'Sao';
    s.address.lat = NaN;
    s.address.city = 'x'.repeat(61);
    s.announcement = { enabled: true, text: ' ' };
    s.hero.title = '';
    s.chapters = s.chapters.map((c) => ({ ...c, enabled: false, features: ['1', '2', '3', '4', '5', '6', '7'] }));
    s.stats[0] = { ...s.stats[0], label: '', value: NaN };
    s.delivery = { pricePerKm: -1, maxKm: 0 };
    const e = validate(s);
    for (const k of ['store.whatsapp', 'store.instagram', 'store.facebook', 'store.email', 'store.name', 'address.zip',
      'address.state', 'address.coords', 'address.city', 'announcement.text', 'hero.title', 'chapters', 'chapters.0.features',
      'stats.0.label', 'stats.0.value', 'delivery.pricePerKm', 'delivery.maxKm']) {
      expect(e[k]).withContext(k).toBeTruthy();
    }
    expect(e['address.city']).toContain('no máximo');
  });

  it('entende coordenadas copiadas do Google Maps', () => {
    expect(parseCoords('-23.5505, -46.6333')).toEqual({ lat: -23.5505, lng: -46.6333 });
    expect(parseCoords(' -23,55 ; -46,63 ')).toEqual({ lat: -23.55, lng: -46.63 });
    expect(parseCoords('-23.5 -46.6')).toEqual({ lat: -23.5, lng: -46.6 });
    expect(parseCoords('Rua X')).toBeNull();
  });

  // ---------------- tela ----------------

  function render(): { f: ComponentFixture<SiteAdmin>; el: HTMLElement; c: SiteAdmin } {
    const f = TestBed.createComponent(SiteAdmin);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, c: f.componentInstance };
  }

  function loggedIn(snapshot: object = { version: 0, settings: null, updatedAt: null }) {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, 'tok');
    const r = render();
    http.expectOne(SITE_API).flush(snapshot);
    r.f.detectChanges();
    return r;
  }

  function type(el: HTMLElement, f: ComponentFixture<SiteAdmin>, sel: string, value: string, event = 'input') {
    const i = el.querySelector<HTMLInputElement>(sel)!;
    i.value = value;
    i.dispatchEvent(new Event(event));
    f.detectChanges();
  }

  it('modo demonstracao: aviso na tela e entra com login e senha em branco; depois carrega a versao atual', () => {
    const { f, el } = render();
    http.expectOne('/api/admin/mode').flush({ enabled: true, demo: true });
    f.detectChanges();
    expect(el.querySelector('form.login')).not.toBeNull();
    expect(el.querySelector('.login .demo')!.textContent).toContain('em branco');
    const submit = el.querySelector<HTMLButtonElement>('form.login button[type=submit]')!;
    expect(submit.disabled).toBeFalse();

    el.querySelector('form.login')!.dispatchEvent(new Event('submit'));
    const bad = http.expectOne('/api/admin/login');
    expect(bad.request.body).toEqual({ username: '', password: '' });
    bad.flush({ detail: 'Muitas tentativas erradas.' }, { status: 429, statusText: 'x' });
    f.detectChanges();
    expect(el.querySelector('.login .error')!.textContent).toContain('Muitas tentativas');

    el.querySelector('form.login')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/admin/login').flush({ token: 'tok', username: 'demonstração', demo: true, expiresInSeconds: 1 });
    const s = structuredClone(DEFAULT_SITE);
    s.store.name = 'PetLand';
    http.expectOne(SITE_API).flush({ version: 4, settings: s, updatedAt: '2026-11-20T10:00:00Z' });
    f.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#loja input')!.value).toBe('PetLand');
    expect(el.querySelector('.title')!.textContent).toContain('versão 4');
    expect(el.querySelector('.savebar.show')).toBeNull();

    el.querySelector<HTMLButtonElement>('button.out')!.click();
    f.detectChanges();
    expect(el.querySelector('form.login')).not.toBeNull();
  });

  it('edita, mostra erro, salva com a versao e o site inteiro passa a usar o novo valor', () => {
    const { f, el, c } = loggedIn({ version: 2, settings: DEFAULT_SITE, updatedAt: null });
    const site = TestBed.inject(SiteConfigService);

    type(el, f, '#loja input[type=tel]', '55 11 9 1234-5678');
    expect(c.draft().store.whatsapp).toBe('5511912345678');
    expect(el.querySelector('#loja a.test')!.getAttribute('href')).toContain('wa.me/5511912345678');
    type(el, f, '#loja input[type=url]', 'javascript:alert(1)');
    expect(el.querySelector('#loja .err')!.textContent).toContain('https://');
    expect(el.querySelector('.savebar .error')!.textContent).toContain('Corrija 1 campo');
    expect(el.querySelector<HTMLButtonElement>('.savebar .btn--gold')!.disabled).toBeTrue();
    type(el, f, '#loja input[type=url]', 'https://instagram.com/petland');
    type(el, f, '#loja input[type=email]', 'oi@petland.example');
    type(el, f, '#loja textarea', 'Sobre nós');
    type(el, f, '#loja .wide input', 'Oi, quero agendar');
    expect(el.querySelector('.savebar.show .muted')!.textContent).toContain('não salvas');

    el.querySelector<HTMLButtonElement>('.savebar .btn--gold')!.click();
    const req = http.expectOne(`${SITE_API}/admin`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get(ADMIN_HEADER)).toBe('tok');
    expect(req.request.body.version).toBe(2);
    expect(req.request.body.settings.store).toEqual(jasmine.objectContaining({
      whatsapp: '5511912345678', instagram: 'https://instagram.com/petland', email: 'oi@petland.example', about: 'Sobre nós',
      whatsappMessage: 'Oi, quero agendar',
    }));
    req.flush({ version: 3, settings: req.request.body.settings, updatedAt: '2026-11-20T12:00:00Z' });
    f.detectChanges();
    expect(c.version()).toBe(3);
    expect(c.dirty()).toBeFalse();
    expect(el.querySelector('.savebar .ok')!.textContent).toContain('no ar');
    expect(site.whatsappUrl()).toContain('5511912345678');

    // voltou a editar: a mensagem de salvo some
    type(el, f, '#loja input', 'Outro nome');
    expect(el.querySelector('.savebar .ok')).toBeNull();
    el.querySelectorAll<HTMLButtonElement>('.savebar .btn')[0].click(); // descartar
    f.detectChanges();
    expect(c.draft().store.name).toBe(DEFAULT_SITE.store.name);
  });

  it('conflito (alguem salvou antes) oferece recarregar; erros da API aparecem; token expirado volta ao login', () => {
    const { f, el, c } = loggedIn();
    c.patch('hours', { store: 'Todos os dias' });
    c.save();
    http.expectOne(`${SITE_API}/admin`).flush({ detail: 'Outra pessoa salvou. Recarregue.' }, { status: 409, statusText: 'x' });
    f.detectChanges();
    expect(el.querySelector('.savebar .error')!.textContent).toContain('Recarregue');
    el.querySelector<HTMLButtonElement>('.savebar .error .mini')!.click();
    const s = structuredClone(DEFAULT_SITE);
    s.hours.store = 'Versão do colega';
    http.expectOne(SITE_API).flush({ version: 9, settings: s, updatedAt: null });
    f.detectChanges();
    expect(c.version()).toBe(9);
    expect(c.draft().hours.store).toBe('Versão do colega');

    c.patch('hours', { store: 'X' });
    c.save();
    http.expectOne(`${SITE_API}/admin`).flush({ detail: 'Dados invalidos', errors: ['settings.store.whatsapp: inválido'] }, { status: 400, statusText: 'x' });
    f.detectChanges();
    expect(el.querySelector('.server-errors')!.textContent).toContain('whatsapp');

    c.save();
    http.expectOne(`${SITE_API}/admin`).flush({ detail: 'Token inválido' }, { status: 401, statusText: 'x' });
    f.detectChanges();
    expect(el.querySelector('form.login .error')!.textContent).toContain('Token inválido');
  });

  it('falha ao carregar avisa; salvar sem mudancas nao chama a API', () => {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, 'tok');
    const { f, el, c } = render();
    http.expectOne(SITE_API).flush('', { status: 503, statusText: 'x' });
    f.detectChanges();
    expect(el.querySelector('.savebar .error')!.textContent).toContain('Não foi possível carregar');
    c.save();
    http.expectNone(`${SITE_API}/admin`);
  });

  it('endereco: CEP preenche rua/bairro/cidade/UF; coordenadas coladas; previa do mapa', () => {
    const { f, el, c } = loggedIn();
    type(el, f, '#endereco .inline input', '20040020');
    expect(c.draft().address.zip).toBe('20040-020');
    el.querySelector<HTMLButtonElement>('#endereco .inline .mini')!.click();
    http.expectOne('/api/address/cep/20040020').flush({ cep: '20040-020', street: 'Avenida Rio Branco', district: 'Centro', city: 'Rio de Janeiro', state: 'RJ', source: 'ViaCEP' });
    f.detectChanges();
    expect(c.draft().address).toEqual(jasmine.objectContaining({ street: 'Avenida Rio Branco, ', district: 'Centro', city: 'Rio de Janeiro', state: 'RJ' }));
    expect(el.querySelector('#endereco .note')!.textContent).toContain('complete o número');

    // mesma rua: mantem o numero que ja estava
    c.patch('address', { street: 'Avenida Rio Branco, 156' });
    c.fillFromCep();
    http.expectOne('/api/address/cep/20040020').flush({ cep: '20040-020', street: 'Avenida Rio Branco', district: '', city: 'Rio de Janeiro', state: 'RJ', source: 'ViaCEP' });
    expect(c.draft().address.street).toBe('Avenida Rio Branco, 156');
    expect(c.draft().address.district).toBe('Centro');

    c.fillFromCep();
    http.expectOne('/api/address/cep/20040020').flush({}, { status: 404, statusText: 'x' });
    f.detectChanges();
    expect(c.cep().msg).toContain('CEP não encontrado');
    c.setZip('123');
    c.fillFromCep(); // CEP incompleto: nao busca
    http.expectNone('/api/address/cep/123');

    const coords = el.querySelectorAll<HTMLInputElement>('#endereco .wide input')[0];
    type(el, f, '#endereco .wide input', '-22.9035, -43.2096');
    expect(c.draft().address.lat).toBe(-22.9035);
    expect(el.querySelector('#endereco app-landing-map')).not.toBeNull();
    coords.value = 'nao sei';
    coords.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(el.querySelector('#endereco')!.textContent).toContain('fora do Brasil');
    expect(el.querySelector('#endereco app-landing-map')).toBeNull();

    const uf = el.querySelector<HTMLSelectElement>('#endereco select')!;
    uf.value = 'SP';
    uf.dispatchEvent(new Event('change'));
    expect(c.draft().address.state).toBe('SP');
  });

  it('aviso, pagina inicial e servicos (ligar/desligar, ordem, destaques)', () => {
    const { f, el, c } = loggedIn();
    el.querySelector<HTMLInputElement>('#horarios .switch input')!.click();
    f.detectChanges();
    expect(el.querySelector('#horarios .err')!.textContent).toContain('Escreva o aviso');
    type(el, f, '#horarios > label input', 'Fechado dia 25');
    expect(c.draft().announcement).toEqual({ enabled: true, text: 'Fechado dia 25' });

    type(el, f, '#inicio .wide2 input', 'Seu pet em boas');
    expect(el.querySelector('#inicio .sample')!.textContent).toContain('Seu pet em boas');

    const toggles = () => el.querySelectorAll<HTMLInputElement>('#servicos .chapter-head input');
    toggles()[0].click(); // desliga o hotel
    f.detectChanges();
    expect(c.draft().chapters[0].enabled).toBeFalse();
    expect(el.querySelector('#servicos li.off')).not.toBeNull();
    el.querySelectorAll<HTMLButtonElement>('#servicos .order .mini')[1].click(); // hotel desce
    f.detectChanges();
    expect(c.draft().chapters.map((x) => x.id)).toEqual(['racoes', 'hotel', 'beleza', 'veterinario']);
    c.moveChapter(0, -1); // ja e o primeiro
    expect(c.draft().chapters[0].id).toBe('racoes');

    const features = el.querySelector<HTMLTextAreaElement>('#servicos li textarea:last-of-type')!;
    c.setFeatures(0, ' Ração A \n\n Ração B ');
    expect(c.draft().chapters[0].features).toEqual(['Ração A', 'Ração B']);
    expect(features).toBeTruthy();

    for (const t of Array.from(toggles())) t.checked && t.click();
    f.detectChanges();
    expect(el.querySelector('#servicos > .err')!.textContent).toContain('pelo menos um');
  });

  it('numeros: adiciona/remove (1 a 4), troca para nota real e entrega com exemplo', () => {
    const { f, el, c } = loggedIn();
    expect(c.draft().stats.length).toBe(4);
    expect(el.querySelector('#numeros .add')).toBeNull();
    el.querySelector<HTMLButtonElement>('#numeros .rm')!.click();
    f.detectChanges();
    expect(c.draft().stats.length).toBe(3);
    el.querySelector<HTMLButtonElement>('#numeros .add')!.click();
    f.detectChanges();
    expect(c.draft().stats[3]).toEqual(jasmine.objectContaining({ label: '', source: 'MANUAL' }));
    expect(el.querySelector('#numeros .err')!.textContent).toContain('obrigatório');

    type(el, f, '#numeros li:last-child .lbl input', 'clientes felizes');
    type(el, f, '#numeros li:last-child input[inputmode=decimal]', '9,5');
    expect(c.draft().stats[3]).toEqual(jasmine.objectContaining({ value: 9.5, decimals: 1 }));
    const source = el.querySelector<HTMLSelectElement>('#numeros li:last-child select')!;
    source.value = 'RATING';
    source.dispatchEvent(new Event('change'));
    f.detectChanges();
    expect(c.draft().stats[3].source).toBe('RATING');
    expect(el.querySelector('#numeros li:last-child input[inputmode=decimal]')).toBeNull();
    type(el, f, '#numeros li:last-child .tiny input', '+');
    expect(c.draft().stats[3].prefix).toBe('+');

    for (let i = 0; i < 5; i++) c.removeStat(0);
    expect(c.draft().stats.length).toBe(1);
    c.addStat();
    c.addStat();
    c.addStat();
    c.addStat();
    expect(c.draft().stats.length).toBe(4);

    const delivery = el.querySelectorAll<HTMLInputElement>('#entrega input');
    delivery[0].value = '3,5';
    delivery[0].dispatchEvent(new Event('input'));
    delivery[1].value = '8';
    delivery[1].dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(c.draft().delivery).toEqual({ pricePerKm: 3.5, maxKm: 8 });
    expect(el.querySelector('#entrega .sample')!.textContent).toContain('5 km');
    expect(el.querySelector('#entrega .sample')!.textContent).toContain('17,50');
    delivery[0].value = '';
    delivery[0].dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(el.querySelector('#entrega .err')).not.toBeNull();
  });

  it('indice rola ate a secao sem sair da pagina', () => {
    const { el } = loggedIn();
    const target = el.querySelector<HTMLElement>('#entrega')!;
    const spy = spyOn(target, 'scrollIntoView');
    const link = el.querySelector<HTMLAnchorElement>('.toc a[href="/gestao#entrega"]')!;
    const ev = new MouseEvent('click', { cancelable: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBeTrue();
    expect(spy).toHaveBeenCalled();
  });

  it('avisa antes de sair da pagina com alteracoes nao salvas', () => {
    const { c } = loggedIn();
    const clean = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    c.beforeUnload(clean);
    expect(clean.defaultPrevented).toBeFalse();
    c.patch('store', { name: 'Outro' });
    const dirty = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    c.beforeUnload(dirty);
    expect(dirty.defaultPrevented).toBeTrue();
  });
});
