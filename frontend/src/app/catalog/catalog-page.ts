import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';

import { ThemeToggle } from '../core/theme-toggle';
import { BagArt } from './bag-art';
import { CartDrawer } from './cart-drawer';
import { CartStore } from './cart.store';
import { CatalogApi } from './catalog.api';
import {
  EMPTY_FILTERS,
  Facets,
  Filters,
  FoodLine,
  LINE_LABEL,
  LifeStage,
  PetSize,
  Product,
  SIZE_LABEL,
  SORT_LABEL,
  SPECIES_LABEL,
  STAGE_LABEL,
  Sort,
  Species,
  money,
} from './catalog.models';
import { CatalogFilters } from './catalog-filters';
import { ProductCard } from './product-card';
import { ToastService } from './toast.service';

export const PAGE_SIZE = 12;

const list = <T extends string>(m: ParamMap, key: string, allowed: readonly string[]) =>
  m.getAll(key).filter((v) => allowed.includes(v)) as T[];
const num = (v: string | null) => (v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Le os filtros do link (?q=...&species=...) ignorando valores invalidos. */
export function filtersFromParams(m: ParamMap): Filters {
  const species = m.get('species');
  const sort = m.get('sort');
  return {
    q: (m.get('q') ?? '').slice(0, 60),
    species: species && species in SPECIES_LABEL ? (species as Species) : null,
    stage: list<LifeStage>(m, 'stage', Object.keys(STAGE_LABEL)),
    petSize: list<PetSize>(m, 'petSize', Object.keys(SIZE_LABEL)),
    line: list<FoodLine>(m, 'line', Object.keys(LINE_LABEL)),
    brand: m.getAll('brand').slice(0, 20),
    minPrice: num(m.get('minPrice')),
    maxPrice: num(m.get('maxPrice')),
    promo: m.get('promo') === 'true',
    sort: sort && sort in SORT_LABEL ? (sort as Sort) : 'RELEVANCE',
  };
}

/** Grava so o que difere do padrao, para o link ficar curto e compartilhavel. */
export function filtersToParams(f: Filters): Record<string, string | string[] | null> {
  return {
    q: f.q.trim() || null,
    species: f.species,
    stage: f.stage.length ? f.stage : null,
    petSize: f.petSize.length ? f.petSize : null,
    line: f.line.length ? f.line : null,
    brand: f.brand.length ? f.brand : null,
    minPrice: f.minPrice == null ? null : String(f.minPrice),
    maxPrice: f.maxPrice == null ? null : String(f.maxPrice),
    promo: f.promo ? 'true' : null,
    sort: f.sort === 'RELEVANCE' ? null : f.sort,
  };
}

/** "termina em 2d 05h" / "termina em 3h 20min" */
export function timeLeft(endIso: string | null, now: number): string | null {
  if (!endIso) return null;
  const ms = new Date(endIso).getTime() - now;
  if (ms <= 0) return 'encerrada';
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `termina em ${d}d ${pad(h)}h` : `termina em ${h}h ${pad(m)}min`;
}

interface Chip {
  label: string;
  remove: Partial<Filters>;
}

@Component({
  selector: 'app-catalog-page',
  imports: [RouterLink, ThemeToggle, ProductCard, CatalogFilters, CartDrawer, BagArt],
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.scss',
})
export class CatalogPage implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly cart = inject(CartStore);
  readonly toast = inject(ToastService);

  readonly filters = signal<Filters>(EMPTY_FILTERS);
  readonly facets = signal<Facets | null>(null);
  readonly items = signal<Product[]>([]);
  readonly total = signal(0);
  readonly hasMore = signal(false);
  readonly page = signal(0);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly offers = signal<Product[]>([]);
  readonly sheetOpen = signal(false);
  readonly now = signal(Date.now());

  readonly sortOptions = Object.entries(SORT_LABEL) as [Sort, string][];
  readonly skeletons = Array.from({ length: 8 }, (_, i) => i);
  readonly money = money;
  readonly timeLeft = timeLeft;

  readonly activeCount = computed(() => this.chips().length);
  readonly chips = computed<Chip[]>(() => {
    const f = this.filters();
    const out: Chip[] = [];
    if (f.promo) out.push({ label: 'Promoções', remove: { promo: false } });
    if (f.species) out.push({ label: SPECIES_LABEL[f.species], remove: { species: null } });
    f.stage.forEach((s) => out.push({ label: STAGE_LABEL[s], remove: { stage: f.stage.filter((x) => x !== s) } }));
    f.petSize.forEach((s) => out.push({ label: `Porte ${SIZE_LABEL[s].toLowerCase()}`, remove: { petSize: f.petSize.filter((x) => x !== s) } }));
    f.line.forEach((s) => out.push({ label: LINE_LABEL[s], remove: { line: f.line.filter((x) => x !== s) } }));
    f.brand.forEach((s) => out.push({ label: s, remove: { brand: f.brand.filter((x) => x !== s) } }));
    if (f.minPrice != null || f.maxPrice != null) {
      const label = f.minPrice != null && f.maxPrice != null
        ? `${money(f.minPrice)} a ${money(f.maxPrice)}`
        : f.minPrice != null ? `A partir de ${money(f.minPrice)}` : `Até ${money(f.maxPrice!)}`;
      out.push({ label, remove: { minPrice: null, maxPrice: null } });
    }
    return out;
  });

  constructor() {
    // Busca reativa: qualquer mudanca nos filtros recarrega (com debounce p/ digitacao) e cancela a anterior
    toObservable(this.filters)
      .pipe(
        tap(() => this.loading.set(true)),
        debounceTime(280),
        tap((f) => this.syncUrl(f)),
        switchMap((f) =>
          this.api.search(f, 0, PAGE_SIZE).pipe(
            map((r) => ({ r, e: null as string | null })),
            catchError((e: Error) => of({ r: null, e: e.message })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ r, e }) => {
        this.loading.set(false);
        this.error.set(e);
        this.page.set(0);
        this.items.set(r?.items ?? []);
        this.total.set(r?.total ?? 0);
        this.hasMore.set(r?.hasMore ?? false);
      });

    // a contagem regressiva das ofertas atualiza a cada 30s
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  ngOnInit(): void {
    this.filters.set(filtersFromParams(this.route.snapshot.queryParamMap));
    this.api.facets().pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef)).subscribe((f) => this.facets.set(f));
    this.api
      .search({ ...EMPTY_FILTERS, promo: true, sort: 'DISCOUNT' }, 0, 10)
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => this.offers.set(r?.items ?? []));
  }

  update(patch: Partial<Filters>): void {
    this.filters.update((f) => ({ ...f, ...patch }));
  }

  clearAll(): void {
    this.filters.set({ ...EMPTY_FILTERS, q: this.filters().q });
  }

  search(q: string): void {
    this.update({ q });
  }

  retry(): void {
    this.filters.update((f) => ({ ...f }));
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    const next = this.page() + 1;
    this.api.search(this.filters(), next, PAGE_SIZE).subscribe({
      next: (r) => {
        this.items.update((list) => [...list, ...r.items]);
        this.page.set(next);
        this.hasMore.set(r.hasMore);
        this.loadingMore.set(false);
      },
      error: (e: Error) => {
        this.toast.show(e.message);
        this.loadingMore.set(false);
      },
    });
  }

  addOffer(p: Product): void {
    const r = this.cart.add(p);
    this.toast.show(r === 'added' ? 'Oferta adicionada ao carrinho 🔥' : 'Não foi possível adicionar');
  }

  openCart(): void {
    this.cart.isOpen.set(true);
  }

  private syncUrl(f: Filters): void {
    this.router.navigate([], { queryParams: filtersToParams(f), replaceUrl: true });
  }
}
