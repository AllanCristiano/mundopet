import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { HttpTestingController } from '@angular/common/http/testing';

import { ANATOMY_LAYERS, CHAPTERS, NAV_LINKS, STATS } from './landing.data';
import { SiteConfigService, SiteSettings } from '../core/site-config';
import { LandingPage } from './landing-page';
import { APK_URL, AppDownloadService } from '../core/app-download.service';
import { LandingApp } from './sections/landing-app';
import { LandingNav } from './sections/landing-nav';
import { makeParticles } from './sections/landing-hero';

describe('LandingPage', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }));

  function render() {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => (document.body.style.overflow = ''));

  it('renderiza todas as secoes com um unico h1', () => {
    const { el } = render();
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent).toContain('merece');
    for (const c of CHAPTERS) {
      expect(el.querySelector(`#${c.id}`)).withContext(c.id).not.toBeNull();
    }
    expect(el.querySelector('#cuidado')).not.toBeNull();
    expect(el.querySelector('#topo')).not.toBeNull();
  });

  it('todo link do menu aponta para uma secao existente', () => {
    const { el } = render();
    for (const link of NAV_LINKS.filter((l) => l.href.startsWith('#'))) {
      expect(el.querySelector(link.href)).withContext(link.href).not.toBeNull();
    }
  });

  it('anatomia tem uma camada e uma legenda por servico', () => {
    const { el } = render();
    expect(el.querySelectorAll('.layer').length).toBe(ANATOMY_LAYERS.length);
    expect(el.querySelectorAll('.label').length).toBe(ANATOMY_LAYERS.length);
  });

  /** Responde as chamadas de depoimentos (secao de numeros e vitrine da beleza). */
  function flushTestimonials(items: object[], average = 4.6) {
    const http = TestBed.inject(HttpTestingController);
    http.match((r) => r.url === '/api/beauty/testimonials')
      .forEach((r) => r.flush({ items, page: 0, size: 10, hasMore: false, summary: { average, count: items.length } }));
    http.match((r) => r.url === '/api/beauty/photos').forEach((r) => r.flush({ items: [], page: 0, size: 10, hasMore: false }));
  }

  const review = (i: number) => ({ id: 't' + i, author: 'Tutor ' + i, petName: 'Pet ' + i, rating: 5, message: 'Adoramos! ' + i,
    status: 'APPROVED', createdAt: '2026-11-20T10:00:00Z' });

  it('depoimentos REAIS aprovados no carrossel (copia oculta) e nota media real nos numeros', () => {
    const { fixture, el } = render();
    flushTestimonials([review(1), review(2), review(3)], 4.6);
    fixture.detectChanges();
    expect(el.querySelectorAll('.proof dd').length).toBe(STATS.length);
    const items = el.querySelectorAll('.reviews li');
    expect(items.length).toBe(6);
    expect(items[3].getAttribute('aria-hidden')).toBe('true');
    expect(items[0].getAttribute('aria-hidden')).toBeNull();
    expect(items[0].textContent).toContain('Adoramos! 1');
    expect(items[0].querySelector('cite')!.textContent).toContain('Tutor 1 · com Pet 1');
    expect(el.querySelector('.proof .more a')!.getAttribute('href')).toBe('/beleza#depoimentos');
    // a nota da secao vira a media real (o contador recria com o valor novo)
    const proof = fixture.debugElement.query((d) => d.name === 'app-landing-proof').componentInstance;
    expect(proof.stats().find((s: { source: string }) => s.source === 'RATING').value).toBe(4.6);
  });

  it('sem depoimentos aprovados: convite para avaliar e nota digitada pelo dono', () => {
    const { fixture, el } = render();
    flushTestimonials([]);
    fixture.detectChanges();
    expect(el.querySelector('.reviews')).toBeNull();
    expect(el.querySelector('.invite a')!.getAttribute('href')).toBe('/beleza#depoimentos');
    const proof = fixture.debugElement.query((d) => d.name === 'app-landing-proof').componentInstance;
    expect(proof.stats().find((s: { source: string }) => s.source === 'RATING').value).toBe(4.9);
  });

  it('textos, servicos e WhatsApp vem da gestao do site', () => {
    const site = TestBed.inject(SiteConfigService);
    const s = structuredClone(site.settings());
    s.hero = { kicker: 'Desde 2010', title: 'Seu pet em boas', highlight: 'mãos', subtitle: 'Sub novo' };
    s.store.whatsapp = '5511912345678';
    s.announcement = { enabled: true, text: 'Fechado no feriado' };
    s.chapters = s.chapters.map((c) => (c.id === 'hotel' ? { ...c, enabled: false } : c));
    s.cta = { kicker: 'K', title: 'Bora', highlight: 'lá', text: 'T' };
    site.apply({ version: 3, settings: s, updatedAt: null });
    const { el } = render();
    expect(el.querySelector('h1')!.textContent!.replace(/\s+/g, ' ')).toContain('Seu pet em boas');
    expect(el.querySelector('h1 em')!.textContent).toContain('mãos');
    expect(el.querySelector('.hero .notice')!.textContent).toContain('Fechado no feriado');
    expect(el.querySelector('#hotel')).toBeNull();
    expect(el.querySelector('.chapter .bignum')!.textContent).toBe('01');
    expect(Array.from(el.querySelectorAll('.nav .links a')).map((a) => a.getAttribute('href'))).not.toContain('#hotel');
    expect(el.querySelector('#cta-title')!.textContent).toContain('Bora');
    expect(el.querySelector<HTMLAnchorElement>('.hero .btn--gold')!.href).toContain('wa.me/5511912345678');
  });

  it('CTAs externos abrem em nova aba com rel=noopener', () => {
    const { el } = render();
    const ctas = el.querySelectorAll<HTMLAnchorElement>(`a[href="${TestBed.inject(SiteConfigService).whatsappUrl()}"]`);
    expect(ctas.length).toBeGreaterThan(3);
    ctas.forEach((a) => expect(a.rel).toContain('noopener'));
  });

  it('cada cena de capitulo tem sua animacao', () => {
    const { el } = render();
    expect(el.querySelector('.scene-hotel .moon')).not.toBeNull();
    expect(el.querySelectorAll('.scene-food .kibble').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('.scene-beauty .bubble').length).toBeGreaterThan(0);
    expect(el.querySelector('.scene-vet .ecg')).not.toBeNull();
  });

  it('ilustracoes decorativas ficam ocultas para leitor de tela; a do hero tem rotulo', () => {
    const { el } = render();
    const hero = el.querySelector('.hero app-pet-art')!;
    expect(hero.getAttribute('role')).toBe('img');
    expect(hero.getAttribute('aria-label')).toContain('cachorro');
    expect(el.querySelector('.scene app-pet-art')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('particulas sao deterministicas', () => {
    expect(makeParticles(5)).toEqual(makeParticles(5));
    expect(makeParticles(5, 1)).not.toEqual(makeParticles(5, 2));
  });

  describe('secao do aplicativo', () => {
    async function renderWith(state: 'available' | 'unavailable', sizeMb: number | null = null) {
      const service = TestBed.inject(AppDownloadService);
      spyOn(service, 'check').and.callFake(async () => {
        service.state.set(state);
        service.sizeMb.set(sizeMb);
        return state;
      });
      const fixture = TestBed.createComponent(LandingApp);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('com APK publicado: link de download direto com tamanho', async () => {
      const el = await renderWith('available', 21.4);
      const a = el.querySelector<HTMLAnchorElement>('.store--android')!;
      expect(a.getAttribute('href')).toBe(APK_URL);
      expect(a.hasAttribute('download')).toBeTrue();
      expect(a.getAttribute('aria-disabled')).toBeNull();
      expect(a.textContent).toContain('21,4 MB');
    });

    it('sem APK: botao desabilitado "em breve" e sem link quebrado', async () => {
      const el = await renderWith('unavailable');
      const a = el.querySelector<HTMLAnchorElement>('.store--android')!;
      expect(a.hasAttribute('href')).toBeFalse();
      expect(a.getAttribute('aria-disabled')).toBe('true');
      expect(a.textContent).toContain('em breve');
    });

    it('mostra as telas do app com o titulo e os numeros da gestao e o que o app faz', async () => {
      const site = TestBed.inject(SiteConfigService);
      site.apply({
        version: 1,
        updatedAt: null,
        settings: { hero: { kicker: 'K', title: 'Seu pet', highlight: 'feliz', subtitle: 's' } } as Partial<SiteSettings> as SiteSettings,
      });
      const el = await renderWith('available');
      expect(el.querySelector('.v1 .h')!.textContent).toContain('Seu pet feliz');
      expect(el.querySelectorAll('.v1 .stats span').length).toBe(4);
      expect(el.querySelector('.v1 .stats')!.textContent).toContain('15.000');
      expect(el.querySelectorAll('.view').length).toBe(3);
      expect(el.querySelectorAll('.tabs span').length).toBe(4);
      const features = Array.from(el.querySelectorAll('.features strong')).map((s) => s.textContent);
      expect(features).toEqual(['Loja de rações', 'Espaço Beleza', 'Atendimento', 'Seus pets']);
    });

    it('mostra "verificando" enquanto confere', () => {
      const service = TestBed.inject(AppDownloadService);
      spyOn(service, 'check').and.returnValue(new Promise(() => undefined));
      const fixture = TestBed.createComponent(LandingApp);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Verificando');
    });
  });

  describe('nav', () => {
    function nav() {
      const fixture = TestBed.createComponent(LandingNav);
      fixture.detectChanges();
      return { fixture, cmp: fixture.componentInstance, host: fixture.nativeElement as HTMLElement };
    }

    it('menu mobile abre, trava o scroll do body e fecha ao clicar num link', () => {
      const { fixture, host } = nav();
      const burger = host.querySelector<HTMLButtonElement>('.burger')!;
      burger.click();
      fixture.detectChanges();
      expect(host.classList).toContain('menu-open');
      expect(burger.getAttribute('aria-expanded')).toBe('true');
      expect(document.body.style.overflow).toBe('hidden');

      host.querySelector<HTMLAnchorElement>('.menu nav a')!.click();
      fixture.detectChanges();
      expect(host.classList).not.toContain('menu-open');
      expect(document.body.style.overflow).toBe('');
      expect(host.querySelector('.menu')!.hasAttribute('inert')).toBeTrue();
    });

    it('fundo da barra e barra de agendamento aparecem conforme o scroll', () => {
      const { cmp, host } = nav();
      spyOnProperty(window, 'scrollY').and.returnValue(window.innerHeight * 2);
      cmp.syncScroll();
      expect(host.classList).toContain('is-scrolled');
      expect(host.classList).toContain('show-bar');
    });

    it('remove o listener e destrava o body ao destruir', () => {
      const { fixture, cmp } = nav();
      cmp.toggle();
      fixture.destroy();
      expect(document.body.style.overflow).toBe('');
    });
  });
});
