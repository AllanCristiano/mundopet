import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { STORE } from '../landing.data';

export interface Store {
  name: string;
  street: string;
  district: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  mapsQuery: string;
}

/** Texto buscado no Google Maps: nome/endereco cadastrado ou, sem isso, as coordenadas. */
export function mapsQuery(store: Store): string {
  return store.mapsQuery?.trim() || `${store.lat},${store.lng}`;
}

/**
 * Embed do Google Maps sem chave de API (output=embed).
 * Alternativa oficial: Maps Embed API (gratuita, exige chave) -> https://www.google.com/maps/embed/v1/place?key=...&q=...
 */
export function googleEmbedUrl(store: Store, zoom = 16): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(mapsQuery(store))}&z=${zoom}&hl=pt-BR&output=embed`;
}

export function directionsUrls(store: Store) {
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery(store))}`,
    waze: `https://waze.com/ul?ll=${store.lat},${store.lng}&navigate=yes`,
    open: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(store))}`,
  };
}

/** Cartao de localizacao: mapa do Google + endereco + "Como chegar" / Waze. */
@Component({
  selector: 'app-landing-map',
  templateUrl: './landing-map.html',
  styleUrl: './landing-map.scss',
})
export class LandingMap {
  private readonly sanitizer = inject(DomSanitizer);
  readonly store = input<Store>(STORE);
  readonly links = computed(() => directionsUrls(this.store()));
  /** Host fixo do Google e busca passada por encodeURIComponent (o texto nunca entra cru): pode ser confiavel. */
  readonly embedUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(googleEmbedUrl(this.store())),
  );
}
