import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { STORE } from '../landing.data';
import { LandingFooter } from './landing-footer';
import { LandingMap, directionsUrls, googleEmbedUrl, mapsQuery } from './landing-map';

describe('LandingMap (Google Maps)', () => {
  function render(store = STORE) {
    const fixture = TestBed.createComponent(LandingMap);
    fixture.componentRef.setInput('store', store);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('sem mapsQuery usa as coordenadas; com mapsQuery usa o nome/endereco', () => {
    expect(mapsQuery({ ...STORE, mapsQuery: '', lat: 1.5, lng: 2.5 })).toBe('1.5,2.5');
    expect(mapsQuery({ ...STORE, mapsQuery: '  MundoPet, Rua X 1  ' })).toBe('MundoPet, Rua X 1');
  });

  it('embed do Google sem chave, em portugues, com a busca codificada', () => {
    const url = googleEmbedUrl({ ...STORE, mapsQuery: 'MundoPet & Cia, Rua X' });
    expect(url).toMatch(/^https:\/\/maps\.google\.com\/maps\?/);
    expect(url).toContain('output=embed');
    expect(url).toContain('hl=pt-BR');
    expect(url).toContain(encodeURIComponent('MundoPet & Cia, Rua X'));
    expect(url).not.toContain('key=');
  });

  it('links de rota (Google e Waze)', () => {
    const links = directionsUrls({ ...STORE, mapsQuery: '', lat: 1.5, lng: 2.5 });
    expect(links.google).toContain('destination=1.5%2C2.5');
    expect(links.waze).toContain('ll=1.5,2.5');
    expect(links.open).toContain('query=1.5%2C2.5');
  });

  it('iframe acessivel e com carregamento preguicoso', () => {
    const iframe = render().querySelector('iframe')!;
    expect(iframe.getAttribute('title')).toContain('Google');
    expect(iframe.getAttribute('loading')).toBe('lazy');
    expect(iframe.src).toContain('maps.google.com');
  });

  it('endereco visivel mesmo se o mapa nao carregar, e links externos seguros', () => {
    const el = render({ ...STORE, street: 'Rua Teste, 42' });
    expect(el.querySelector('address')!.textContent).toContain('Rua Teste, 42');
    const external = el.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]');
    expect(external.length).toBe(2);
    external.forEach((a) => expect(a.rel).toContain('noopener'));
  });
});

describe('LandingFooter', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  function render() {
    const fixture = TestBed.createComponent(LandingFooter);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('tem marca, servicos (sem o link do app), atendimento, mapa e voltar ao topo', () => {
    const el = render();
    expect(el.querySelector('.logo')).not.toBeNull();
    const services = Array.from(el.querySelectorAll('nav.col a')).map((a) => a.getAttribute('href'));
    expect(services).toEqual(['#hotel', '#racoes', '#beleza', '#veterinario', '/racoes', '/beleza']);
    expect(el.querySelector('a.shop')!.textContent).toContain('Loja');
    expect(el.textContent).toContain(STORE.clinicHours);
    expect(el.querySelector('app-landing-map')).not.toBeNull();
    expect(el.querySelector('a.up')!.getAttribute('href')).toBe('#topo');
  });

  it('redes sociais com rotulo acessivel e noopener', () => {
    const social = render().querySelectorAll<HTMLAnchorElement>('.social a[target="_blank"]');
    expect(social.length).toBe(2);
    social.forEach((a) => {
      expect(a.getAttribute('aria-label')).toBeTruthy();
      expect(a.rel).toContain('noopener');
    });
  });
});
