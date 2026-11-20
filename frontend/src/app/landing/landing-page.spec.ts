import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { ANATOMY_LAYERS, CHAPTERS, NAV_LINKS, STATS, TESTIMONIALS, WHATSAPP_URL } from './landing.data';
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

  it('numeros e depoimentos (copia do carrossel oculta para leitor de tela)', () => {
    const { el } = render();
    expect(el.querySelectorAll('dd').length).toBe(STATS.length);
    const items = el.querySelectorAll('.reviews li');
    expect(items.length).toBe(TESTIMONIALS.length * 2);
    expect(items[TESTIMONIALS.length].getAttribute('aria-hidden')).toBe('true');
    expect(items[0].getAttribute('aria-hidden')).toBeNull();
  });

  it('CTAs externos abrem em nova aba com rel=noopener', () => {
    const { el } = render();
    const ctas = el.querySelectorAll<HTMLAnchorElement>(`a[href="${WHATSAPP_URL}"]`);
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
