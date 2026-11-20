import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, firstValueFrom, map, of, timeout } from 'rxjs';

import { CHAPTERS, NAV_LINKS, STATS, STORE, Scene } from '../landing/landing.data';

// ---------------- Tipos (iguais ao backend: modulo "site") ----------------

export type ChapterId = 'hotel' | 'racoes' | 'beleza' | 'veterinario';

export interface SiteSettings {
  store: {
    name: string;
    about: string;
    whatsapp: string;
    whatsappMessage: string;
    instagram: string;
    facebook: string;
    email: string;
  };
  address: {
    street: string;
    district: string;
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
    mapsQuery: string;
  };
  hours: { store: string; clinic: string };
  announcement: { enabled: boolean; text: string };
  hero: { kicker: string; title: string; highlight: string; subtitle: string };
  cta: { kicker: string; title: string; highlight: string; text: string };
  chapters: {
    id: ChapterId;
    enabled: boolean;
    kicker: string;
    title: string;
    highlight: string;
    text: string;
    features: string[];
    cta: string;
  }[];
  stats: { label: string; value: number; prefix: string; suffix: string; decimals: number; source: 'MANUAL' | 'RATING' }[];
  delivery: { pricePerKm: number; maxKm: number };
}

export interface SiteSnapshot {
  version: number;
  settings: SiteSettings | null;
  updatedAt: string | null;
}

export const SITE_API = '/api/site';
const SCENES: Record<ChapterId, Scene> = { hotel: 'hotel', racoes: 'food', beleza: 'beauty', veterinario: 'vet' };

/**
 * Textos padrao (os que o site ja tinha). Valem enquanto o dono nao salvar a gestao
 * e para qualquer campo que vier faltando.
 */
export const DEFAULT_SITE: SiteSettings = {
  store: {
    name: STORE.name,
    about: 'Hotel, rações, banho & tosa e clínica veterinária 24h. Tudo o que o seu melhor amigo merece, em um só lugar.',
    whatsapp: '5500000000000',
    whatsappMessage: 'Olá! Quero conhecer o MundoPet',
    instagram: STORE.instagram,
    facebook: '',
    email: '',
  },
  address: {
    street: STORE.street,
    district: STORE.district,
    city: STORE.city,
    state: STORE.state,
    zip: STORE.zip,
    lat: STORE.lat,
    lng: STORE.lng,
    mapsQuery: STORE.mapsQuery,
  },
  hours: { store: STORE.hours, clinic: STORE.clinicHours },
  announcement: { enabled: false, text: '' },
  hero: {
    kicker: 'Pet shop · Hotel · Spa · Clínica',
    title: 'Tudo o que o seu melhor amigo',
    highlight: 'merece',
    subtitle: 'Hospedagem com carinho, nutrição de verdade, beleza de spa e veterinários 24h — tudo em um só lugar.',
  },
  cta: {
    kicker: 'Portas abertas todos os dias',
    title: 'Venha nos',
    highlight: 'conhecer',
    text: 'Traga seu pet para um tour: conheça as suítes do hotel, o spa e a clínica. O primeiro petisco é por nossa conta.',
  },
  chapters: CHAPTERS.map((c) => ({
    id: c.id as ChapterId,
    enabled: true,
    kicker: c.kicker,
    title: c.title,
    highlight: c.titleEm,
    text: c.text,
    features: [...c.features],
    cta: c.cta,
  })),
  stats: STATS.map((s) => ({
    label: s.label,
    value: s.value,
    prefix: s.prefix,
    suffix: s.suffix,
    decimals: s.decimals,
    source: s.label.includes('avalia') ? ('RATING' as const) : ('MANUAL' as const),
  })),
  delivery: { pricePerKm: 2, maxKm: 15 },
};

/** Junta o que veio do servidor com os padroes (campo faltando ou de tipo errado = usa o padrao). */
export function mergeSettings(server: Partial<SiteSettings> | null | undefined, base: SiteSettings = DEFAULT_SITE): SiteSettings {
  if (!server || typeof server !== 'object') return structuredClone(base);
  const obj = <T extends object>(def: T, val: unknown): T => {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return { ...def };
    const out = { ...def } as Record<string, unknown>;
    for (const k of Object.keys(def)) {
      const v = (val as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && typeof v === typeof (def as Record<string, unknown>)[k]) out[k] = v;
    }
    return out as T;
  };
  const chapters = base.chapters.map((def) => {
    const found = Array.isArray(server.chapters) ? server.chapters.find((c) => c?.id === def.id) : undefined;
    const merged = obj(def, found);
    merged.features = Array.isArray(found?.features) ? found.features.filter((f) => typeof f === 'string') : [...def.features];
    return merged;
  });
  // ordem definida pelo dono
  if (Array.isArray(server.chapters)) {
    const order = server.chapters.map((c) => c?.id);
    const rank = (id: ChapterId) => (order.indexOf(id) < 0 ? 99 : order.indexOf(id));
    chapters.sort((a, b) => rank(a.id) - rank(b.id));
  }
  const stats = Array.isArray(server.stats) && server.stats.length
    ? server.stats.slice(0, 4).map((s, i) => obj(base.stats[i] ?? base.stats[0], s))
    : base.stats.map((s) => ({ ...s }));
  return {
    store: obj(base.store, server.store),
    address: obj(base.address, server.address),
    hours: obj(base.hours, server.hours),
    announcement: obj(base.announcement, server.announcement),
    hero: obj(base.hero, server.hero),
    cta: obj(base.cta, server.cta),
    chapters,
    stats,
    delivery: obj(base.delivery, server.delivery),
  };
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** Configuracao viva do site (sinais): a landing, a loja e o Espaco Beleza leem daqui. */
@Injectable({ providedIn: 'root' })
export class SiteConfigService {
  private readonly http = inject(HttpClient);

  readonly settings = signal<SiteSettings>(structuredClone(DEFAULT_SITE));
  readonly version = signal(0);
  readonly updatedAt = signal<string | null>(null);

  /** Link do WhatsApp com a mensagem padrao (botoes "Agendar visita"). */
  readonly whatsappUrl = computed(() => waLink(this.settings().store.whatsapp, this.settings().store.whatsappMessage));

  /** Formato usado pelo mapa/rodape. */
  readonly store = computed(() => {
    const s = this.settings();
    return {
      name: s.store.name,
      street: s.address.street,
      district: s.address.district,
      city: s.address.city,
      state: s.address.state,
      zip: s.address.zip,
      hours: s.hours.store,
      clinicHours: s.hours.clinic,
      lat: s.address.lat,
      lng: s.address.lng,
      mapsQuery: s.address.mapsQuery,
      instagram: s.store.instagram,
    };
  });

  /** Capitulos ligados, na ordem, com cena e numero (01, 02...). */
  readonly chapters = computed(() =>
    this.settings()
      .chapters.filter((c) => c.enabled)
      .map((c, i) => ({ ...c, scene: SCENES[c.id], number: String(i + 1).padStart(2, '0') })),
  );

  /** Menu: some o link de servico desligado. */
  readonly navLinks = computed(() => {
    const on = new Set(this.chapters().map((c) => `#${c.id}`));
    const chapterIds = new Set(CHAPTERS.map((c) => `#${c.id}`));
    return NAV_LINKS.filter((l) => !chapterIds.has(l.href) || on.has(l.href));
  });

  whatsappLink(text: string): string {
    return waLink(this.settings().store.whatsapp, text);
  }

  apply(snapshot: SiteSnapshot): void {
    this.settings.set(mergeSettings(snapshot.settings));
    this.version.set(snapshot.version);
    this.updatedAt.set(snapshot.updatedAt);
  }

  /** Carrega na abertura do app. Se a API demorar/falhar, segue com os padroes (o site nunca trava). */
  load(waitMs = 1500): Promise<void> {
    return firstValueFrom(
      this.http.get<SiteSnapshot>(SITE_API).pipe(
        timeout(waitMs),
        map((s) => this.apply(s)),
        catchError(() => of(undefined)),
      ),
    );
  }
}
