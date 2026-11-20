import { TestBed } from '@angular/core/testing';

import { STORE } from '../landing.data';
import { LandingMap, directionsUrls, osmEmbedUrl } from './landing-map';

describe('LandingMap', () => {
  function render(store = STORE) {
    const fixture = TestBed.createComponent(LandingMap);
    fixture.componentRef.setInput('store', store);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('embed do OpenStreetMap centralizado no endereco, com marcador', () => {
    const url = osmEmbedUrl(-23.5, -46.6);
    expect(url).toMatch(/^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/);
    expect(url).toContain('marker=-23.5%2C-46.6');
    const bbox = decodeURIComponent(/bbox=([^&]+)/.exec(url)![1]).split(',').map(Number);
    expect((bbox[0] + bbox[2]) / 2).toBeCloseTo(-46.6, 4);
    expect((bbox[1] + bbox[3]) / 2).toBeCloseTo(-23.5, 4);
  });

  it('links de rota para Google Maps e Waze usam as coordenadas', () => {
    const links = directionsUrls({ ...STORE, lat: 1.5, lng: 2.5 });
    expect(links.google).toContain('destination=1.5,2.5');
    expect(links.waze).toContain('ll=1.5,2.5');
    expect(links.search).toContain(encodeURIComponent(STORE.street));
  });

  it('iframe com titulo acessivel, carregamento preguicoso e sem vazar referrer', () => {
    const iframe = render().querySelector('iframe')!;
    expect(iframe.getAttribute('title')).toContain('MundoPet');
    expect(iframe.getAttribute('loading')).toBe('lazy');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.src).toContain('openstreetmap.org');
  });

  it('endereco visivel mesmo se o mapa nao carregar, e links externos seguros', () => {
    const el = render({ ...STORE, street: 'Rua Teste, 42' });
    expect(el.querySelector('address')!.textContent).toContain('Rua Teste, 42');
    const external = el.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]');
    expect(external.length).toBe(3);
    external.forEach((a) => expect(a.rel).toContain('noopener'));
  });
});
