import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { beautyError } from '../beauty/beauty.api';
import { AddressApi, UFS, cepDigits, maskCep } from '../catalog/address';
import { money } from '../catalog/catalog.models';
import { AdminLogin } from '../core/admin-login';
import { AdminSession } from '../core/admin-session';
import { SITE_API, SiteConfigService, SiteSettings, SiteSnapshot, waLink } from '../core/site-config';
import { ThemeToggle } from '../core/theme-toggle';
import { LandingMap, Store } from '../landing/sections/landing-map';

type Settings = SiteSettings;
type Chapter = Settings['chapters'][number];
type Stat = Settings['stats'][number];

export const SECTIONS = [
  { id: 'loja', label: 'Loja e contato' },
  { id: 'endereco', label: 'Endereço e mapa' },
  { id: 'horarios', label: 'Horários e aviso' },
  { id: 'inicio', label: 'Página inicial' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'numeros', label: 'Números' },
  { id: 'entrega', label: 'Entrega' },
] as const;

export const CHAPTER_NAMES: Record<Chapter['id'], string> = {
  hotel: 'Hotel & Day Care',
  racoes: 'Rações',
  beleza: 'Banho & Tosa',
  veterinario: 'Veterinário',
};

const HTTPS = /^https:\/\/[^\s<>"']{3,200}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validacao da tela (a API valida de novo). Chave = campo, valor = mensagem. */
export function validate(s: Settings): Record<string, string> {
  const e: Record<string, string> = {};
  const req = (key: string, v: string, label: string, max: number) => {
    if (!v.trim()) e[key] = `${label} é obrigatório`;
    else if (v.length > max) e[key] = `${label}: no máximo ${max} caracteres`;
  };
  req('store.name', s.store.name, 'Nome', 40);
  if (!/^\d{10,15}$/.test(s.store.whatsapp)) e['store.whatsapp'] = 'Só números, com DDI e DDD (ex.: 5511999998888)';
  if (s.store.instagram && !HTTPS.test(s.store.instagram)) e['store.instagram'] = 'Use o link completo começando com https://';
  if (s.store.facebook && !HTTPS.test(s.store.facebook)) e['store.facebook'] = 'Use o link completo começando com https://';
  if (s.store.email && !EMAIL.test(s.store.email)) e['store.email'] = 'E-mail inválido';
  req('address.street', s.address.street, 'Rua e número', 120);
  req('address.city', s.address.city, 'Cidade', 60);
  if (!/^[A-Za-z]{2}$/.test(s.address.state)) e['address.state'] = 'Escolha a UF';
  if (!/^\d{5}-?\d{3}$/.test(s.address.zip)) e['address.zip'] = 'CEP inválido';
  if (!(s.address.lat >= -34.5 && s.address.lat <= 6 && s.address.lng >= -75 && s.address.lng <= -28)) {
    e['address.coords'] = 'Coordenadas fora do Brasil: cole as coordenadas do Google Maps';
  }
  req('hours.store', s.hours.store, 'Horário da loja', 80);
  if (s.announcement.enabled && !s.announcement.text.trim()) e['announcement.text'] = 'Escreva o aviso (ou desligue)';
  req('hero.title', s.hero.title, 'Título', 80);
  req('cta.title', s.cta.title, 'Título do convite', 40);
  s.chapters.forEach((c, i) => {
    req(`chapters.${i}.title`, c.title, 'Título', 40);
    req(`chapters.${i}.cta`, c.cta, 'Texto do botão', 40);
    if (c.features.length > 6) e[`chapters.${i}.features`] = 'No máximo 6 itens';
  });
  if (!s.chapters.some((c) => c.enabled)) e['chapters'] = 'Deixe pelo menos um serviço ligado';
  s.stats.forEach((st, i) => {
    req(`stats.${i}.label`, st.label, 'Descrição', 40);
    if (!(st.value >= 0)) e[`stats.${i}.value`] = 'Número inválido';
  });
  if (!(s.delivery.pricePerKm >= 0 && s.delivery.pricePerKm <= 100)) e['delivery.pricePerKm'] = 'Entre R$ 0 e R$ 100 por km';
  if (!(s.delivery.maxKm >= 0.5 && s.delivery.maxKm <= 100)) e['delivery.maxKm'] = 'Entre 0,5 e 100 km';
  return e;
}

/** "-23.55, -46.63" (copiado do Google Maps) -> { lat, lng } */
export function parseCoords(raw: string): { lat: number; lng: number } | null {
  const m = raw.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.'));
  const lng = Number(m[2].replace(',', '.'));
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** /gestao: o dono personaliza o site (sem programador e sem deploy). */
@Component({
  selector: 'app-site-admin',
  imports: [RouterLink, ThemeToggle, LandingMap, DatePipe, AdminLogin],
  templateUrl: './site-admin.html',
  styleUrl: './site-admin.scss',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class SiteAdmin {
  private readonly http = inject(HttpClient);
  private readonly site = inject(SiteConfigService);
  private readonly addressApi = inject(AddressApi);
  readonly session = inject(AdminSession);

  readonly sections = SECTIONS;
  readonly chapterNames = CHAPTER_NAMES;
  readonly ufs = UFS;
  readonly money = money;

  // ---------- edicao ----------
  readonly saved = signal<Settings>(structuredClone(this.site.settings()));
  readonly draft = signal<Settings>(structuredClone(this.site.settings()));
  readonly version = signal(this.site.version());
  readonly updatedAt = signal(this.site.updatedAt());
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly result = signal<{ ok: boolean; text: string; conflict?: boolean } | null>(null);
  readonly serverErrors = signal<string[]>([]);
  /** "Salvo!" some assim que o dono volta a editar. */
  readonly shownResult = computed(() => {
    const r = this.result();
    return r?.ok && this.dirty() ? null : r;
  });

  readonly errors = computed(() => validate(this.draft()));
  readonly errorCount = computed(() => Object.keys(this.errors()).length);
  readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()));
  readonly coordsText = signal(this.coordsOf(this.draft()));
  readonly cep = signal({ busy: false, msg: '' });

  /** Previa do mapa com o endereco digitado. */
  readonly mapStore = computed<Store>(() => {
    const d = this.draft();
    return { name: d.store.name, ...d.address };
  });
  readonly whatsappTest = computed(() => waLink(this.draft().store.whatsapp, this.draft().store.whatsappMessage));
  /** Exemplo da conta de entrega para o dono conferir. */
  readonly deliveryExample = computed(() => {
    const d = this.draft().delivery;
    const km = Math.min(5, d.maxKm);
    return { km, fee: Math.round(km * d.pricePerKm * 100) / 100 };
  });

  constructor() {
    if (this.session.token()) this.reload();
  }

  // ---------- acesso ----------

  logout(): void {
    this.session.logout();
  }

  // ---------- carregar / salvar ----------

  /** Sempre parte da versao mais nova do servidor. */
  reload(): void {
    this.loading.set(true);
    this.http.get<SiteSnapshot>(SITE_API).subscribe({
      next: (snap) => {
        this.loading.set(false);
        this.site.apply(snap);
        this.reset(snap);
        this.result.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.result.set({ ok: false, text: 'Não foi possível carregar as configurações. Tente de novo.' });
      },
    });
  }

  private reset(snap: SiteSnapshot): void {
    const s = this.site.settings();
    this.saved.set(structuredClone(s));
    this.draft.set(structuredClone(s));
    this.version.set(snap.version);
    this.updatedAt.set(snap.updatedAt);
    this.coordsText.set(this.coordsOf(s));
    this.serverErrors.set([]);
  }

  discard(): void {
    this.draft.set(structuredClone(this.saved()));
    this.coordsText.set(this.coordsOf(this.saved()));
    this.result.set(null);
  }

  save(): void {
    if (this.saving() || this.errorCount() > 0 || !this.dirty()) return;
    this.saving.set(true);
    this.serverErrors.set([]);
    this.http.put<SiteSnapshot>(`${SITE_API}/admin`, { version: this.version(), settings: this.draft() }, this.session.headers()).subscribe({
      next: (snap) => {
        this.saving.set(false);
        this.site.apply(snap);
        this.reset(snap);
        this.result.set({ ok: true, text: 'Site atualizado! As mudanças já estão no ar.' });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const e = beautyError(err) as Error & { status?: number };
        if (e.status === 401 || e.status === 403) {
          this.session.logout(e.message);
          return;
        }
        const list = Array.isArray(err.error?.errors) ? (err.error.errors as string[]) : [];
        this.serverErrors.set(list);
        this.result.set({ ok: false, text: e.message, conflict: err.status === 409 });
      },
    });
  }

  beforeUnload(e: BeforeUnloadEvent): void {
    if (this.dirty()) e.preventDefault();
  }

  // ---------- edicao ----------

  patch<K extends keyof Settings>(section: K, change: Partial<Settings[K]>): void {
    this.draft.update((d) => ({ ...d, [section]: { ...d[section], ...change } }));
  }

  patchChapter(i: number, change: Partial<Chapter>): void {
    this.draft.update((d) => ({ ...d, chapters: d.chapters.map((c, j) => (j === i ? { ...c, ...change } : c)) }));
  }

  /** Uma linha = um item da lista. */
  setFeatures(i: number, text: string): void {
    this.patchChapter(i, { features: text.split('\n').map((l) => l.trim()).filter(Boolean) });
  }

  moveChapter(i: number, step: number): void {
    this.draft.update((d) => {
      const list = [...d.chapters];
      const j = i + step;
      if (j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, chapters: list };
    });
  }

  patchStat(i: number, change: Partial<Stat>): void {
    this.draft.update((d) => ({ ...d, stats: d.stats.map((s, j) => (j === i ? { ...s, ...change } : s)) }));
  }

  addStat(): void {
    this.draft.update((d) =>
      d.stats.length >= 4 ? d : { ...d, stats: [...d.stats, { label: '', value: 0, prefix: '', suffix: '', decimals: 0, source: 'MANUAL' }] },
    );
  }

  removeStat(i: number): void {
    this.draft.update((d) => (d.stats.length <= 1 ? d : { ...d, stats: d.stats.filter((_, j) => j !== i) }));
  }

  setCoords(raw: string): void {
    this.coordsText.set(raw);
    const c = parseCoords(raw);
    if (c) this.patch('address', c);
    else this.patch('address', { lat: NaN, lng: NaN });
  }

  setZip(raw: string): void {
    this.patch('address', { zip: maskCep(raw) });
    this.cep.set({ busy: false, msg: '' });
  }

  /** Preenche rua, bairro, cidade e UF pelo CEP (mesma busca da entrega). */
  fillFromCep(): void {
    const zip = this.draft().address.zip;
    if (cepDigits(zip).length !== 8) return;
    this.cep.set({ busy: true, msg: '' });
    this.addressApi.lookup(zip).subscribe({
      next: (a) => {
        const current = this.draft().address;
        // mesma rua: mantem o que ja estava (com o numero); rua nova: preenche e falta o numero
        const same = !a.street || current.street.toLowerCase().startsWith(a.street.toLowerCase());
        const street = same ? current.street || a.street : `${a.street}, `;
        this.patch('address', { street, district: a.district || current.district, city: a.city, state: a.state });
        this.cep.set({ busy: false, msg: 'Endereço encontrado! Confira e complete o número.' });
      },
      error: (err: Error) => this.cep.set({ busy: false, msg: err.message }),
    });
  }

  /** Indice: rola ate a secao respeitando a barra fixa (scroll-margin) e sem sair da pagina. */
  jump(e: Event, id: string): void {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  num(e: Event): number {
    const raw = (e.target as HTMLInputElement).value.replace(',', '.');
    return raw.trim() === '' ? NaN : Number(raw);
  }

  checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  digits(e: Event): string {
    return (e.target as HTMLInputElement).value.replace(/\D/g, '');
  }

  err(key: string): string | null {
    return this.errors()[key] ?? null;
  }

  private coordsOf(s: Settings): string {
    return `${s.address.lat}, ${s.address.lng}`;
  }
}
