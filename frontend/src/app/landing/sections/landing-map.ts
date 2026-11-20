import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { STORE } from '../landing.data';
import { RevealDirective } from '../motion/reveal.directive';

type Store = typeof STORE;

/** Monta a URL de embed do OpenStreetMap (sem chave, sem rastreio) com marcador no endereco. */
export function osmEmbedUrl(lat: number, lng: number, zoomDelta = 0.006): string {
  const bbox = [lng - zoomDelta * 1.6, lat - zoomDelta, lng + zoomDelta * 1.6, lat + zoomDelta].map((n) => n.toFixed(5));
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.join('%2C')}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function directionsUrls(store: Store) {
  const address = encodeURIComponent(`${store.street}, ${store.district}, ${store.city} - ${store.state}, ${store.zip}`);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`,
    waze: `https://waze.com/ul?ll=${store.lat},${store.lng}&navigate=yes`,
    search: `https://www.google.com/maps/search/?api=1&query=${address}`,
  };
}

@Component({
  selector: 'app-landing-map',
  imports: [RevealDirective],
  template: `
    <div class="map-block" appReveal>
      <div class="map">
        <!-- Carrega so quando chega perto da tela (loading=lazy). Se falhar, endereco e botoes continuam uteis. -->
        <iframe
          [src]="embedUrl()"
          [title]="'Mapa com a localização da ' + store().name"
          loading="lazy"
          referrerpolicy="no-referrer"
        ></iframe>
        <span class="pulse" aria-hidden="true"></span>
        <a class="expand" [href]="links().search" target="_blank" rel="noopener">Ampliar mapa ↗</a>
      </div>

      <address class="info">
        <p class="kicker">Onde estamos</p>
        <p class="street">{{ store().street }}</p>
        <p class="muted">{{ store().district }} · {{ store().city }}/{{ store().state }} · CEP {{ store().zip }}</p>
        <p class="muted">{{ store().hours }}<br />{{ store().clinicHours }}</p>
        <div class="go">
          <a class="btn btn--gold" [href]="links().google" target="_blank" rel="noopener">Como chegar</a>
          <a class="btn" [href]="links().waze" target="_blank" rel="noopener">Abrir no Waze</a>
        </div>
      </address>
    </div>
  `,
  styles: `
    .map-block { display: grid; gap: 24px; margin-top: 40px; }
    .map {
      position: relative; height: 260px; border-radius: 20px; overflow: hidden;
      border: 1px solid var(--line); background: var(--bg-2);
      box-shadow: 0 30px 60px -30px rgba(0, 0, 0, .45);
    }
    iframe { width: 100%; height: 100%; border: 0; display: block; transition: filter .6s; }
    /* Tema escuro: escurece o mapa (os tiles do OSM sao claros) mantendo as cores reconheciveis */
    :host-context([data-theme='dark']) iframe { filter: invert(.92) hue-rotate(180deg) saturate(.7) brightness(.95); }
    .pulse {
      position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px;
      border-radius: 50%; border: 2px solid var(--gold); pointer-events: none;
      animation: ping 2.2s var(--ease-out) infinite;
    }
    .expand {
      position: absolute; right: 10px; bottom: 10px; padding: 10px 14px; min-height: 40px;
      border-radius: 999px; background: var(--glass); backdrop-filter: blur(8px);
      font-size: .78rem; text-decoration: none; border: 1px solid var(--line);
    }
    address { font-style: normal; }
    .kicker { margin: 0 0 8px; }
    .street { font-family: var(--font-display); font-size: 1.5rem; margin: 0 0 6px; }
    .muted { color: var(--muted); margin: 0 0 12px; }
    .go { display: grid; gap: 10px; margin-top: 18px; }
    @media (min-width: 900px) {
      .map-block { grid-template-columns: 1.6fr 1fr; align-items: center; gap: 48px; }
      .map { height: 340px; }
      .go { grid-template-columns: auto auto; justify-content: start; }
    }
    @keyframes ping {
      0% { transform: scale(.6); opacity: 1; }
      100% { transform: scale(3.2); opacity: 0; }
    }
  `,
})
export class LandingMap {
  private readonly sanitizer = inject(DomSanitizer);
  readonly store = input<Store>(STORE);
  readonly links = computed(() => directionsUrls(this.store()));
  /** URL montada so a partir das constantes da loja (nunca de entrada do usuario), por isso pode ser confiavel. */
  readonly embedUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(osmEmbedUrl(this.store().lat, this.store().lng)),
  );
}
