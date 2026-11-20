import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, debounceTime, filter, map, of, switchMap, tap } from 'rxjs';

import { whatsappLink } from '../landing/landing.data';
import { BagArt } from './bag-art';
import { CartStore, MAX_QTY } from './cart.store';
import { CatalogApi } from './catalog.api';
import { Fulfillment, Quote, QuoteRequest, kg, money } from './catalog.models';
import { whatsappToHtml } from './whatsapp-format';

@Component({
  selector: 'app-cart-drawer',
  imports: [BagArt],
  templateUrl: './cart-drawer.html',
  styleUrl: './cart-drawer.scss',
  host: { '[class.open]': 'cart.isOpen()', '(document:keydown.escape)': 'close()' },
})
export class CartDrawer {
  readonly cart = inject(CartStore);
  private readonly api = inject(CatalogApi);

  readonly customerName = signal('');
  readonly fulfillment = signal<Fulfillment>('PICKUP');
  readonly notes = signal('');
  readonly showPreview = signal(false);
  readonly sent = signal(false);

  readonly quote = signal<Quote | null>(null);
  readonly quoteKey = signal('');
  readonly quoting = signal(false);
  readonly quoteError = signal<string | null>(null);

  readonly money = money;
  readonly kg = kg;
  readonly maxQty = MAX_QTY;

  readonly request = computed<QuoteRequest>(() => ({
    items: this.cart.lines().map((l) => ({ productId: l.id, quantity: l.qty })),
    customerName: this.customerName().trim() || null,
    fulfillment: this.fulfillment(),
    notes: this.notes().trim() || null,
  }));
  private readonly requestKey = computed(() => JSON.stringify(this.request()));

  /** So deixa enviar se o orcamento corresponde exatamente ao carrinho atual. */
  readonly canSend = computed(
    () => !this.quoting() && !!this.quote()?.whatsappText && this.quoteKey() === this.requestKey(),
  );
  readonly preview = computed(() => whatsappToHtml(this.quote()?.whatsappText ?? ''));
  readonly unavailableNames = computed(() => {
    const ids = new Set(this.quote()?.unavailable ?? []);
    return this.cart.lines().filter((l) => ids.has(l.id));
  });

  constructor() {
    combineLatest([toObservable(this.request), toObservable(this.cart.isOpen)])
      .pipe(
        filter(([req, open]) => open && req.items.length > 0),
        tap(() => this.quoting.set(true)),
        debounceTime(350),
        map(([req]) => req),
        switchMap((req) => {
          const key = JSON.stringify(req);
          return this.api.quote(req).pipe(
            map((q) => ({ q, key, error: null as string | null })),
            catchError((e: Error) => of({ q: null, key, error: e.message })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ q, key, error }) => {
        this.quote.set(q);
        this.quoteKey.set(key);
        this.quoteError.set(error);
        this.quoting.set(false);
      });

    // carrinho vazio: zera o orcamento
    effect(() => {
      if (this.cart.lines().length === 0) {
        this.quote.set(null);
        this.quoting.set(false);
      }
    });
  }

  lineOf(id: string) {
    return this.quote()?.lines.find((l) => l.productId === id) ?? null;
  }

  close(): void {
    this.cart.isOpen.set(false);
  }

  removeUnavailable(): void {
    this.cart.removeMany(this.quote()?.unavailable ?? []);
  }

  send(): void {
    const text = this.quote()?.whatsappText;
    if (!this.canSend() || !text) return;
    window.open(whatsappLink(text), '_blank', 'noopener');
    this.sent.set(true);
  }

  finish(clear: boolean): void {
    if (clear) this.cart.clear();
    this.sent.set(false);
    if (clear) this.close();
  }
}
