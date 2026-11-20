import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, debounceTime, filter, map, of, switchMap, tap } from 'rxjs';

import { SiteConfigService } from '../core/site-config';
import { DeliveryAddress, isAddressValid, loadAddress, saveAddress, toApiAddress } from './address';
import { AddressForm } from './address-form';
import { BagArt } from './bag-art';
import { CartStore, MAX_QTY } from './cart.store';
import { CatalogApi } from './catalog.api';
import { Fulfillment, Quote, QuoteRequest, kg, km, money } from './catalog.models';
import { whatsappToHtml } from './whatsapp-format';

@Component({
  selector: 'app-cart-drawer',
  imports: [BagArt, AddressForm],
  templateUrl: './cart-drawer.html',
  styleUrl: './cart-drawer.scss',
  host: { '[class.open]': 'cart.isOpen()', '(document:keydown.escape)': 'close()' },
})
export class CartDrawer {
  readonly cart = inject(CartStore);
  private readonly api = inject(CatalogApi);
  private readonly site = inject(SiteConfigService);

  readonly customerName = signal('');
  readonly fulfillment = signal<Fulfillment>('PICKUP');
  readonly notes = signal('');
  /** Endereco fica salvo no aparelho para a proxima compra. */
  readonly address = signal<DeliveryAddress>(loadAddress());
  readonly addressValid = computed(() => isAddressValid(this.address()));
  readonly needsAddress = computed(() => this.fulfillment() === 'DELIVERY' && !this.addressValid());
  readonly showPreview = signal(false);
  readonly sent = signal(false);

  readonly quote = signal<Quote | null>(null);
  readonly quoteKey = signal('');
  readonly quoting = signal(false);
  readonly quoteError = signal<string | null>(null);

  readonly money = money;
  readonly kg = kg;
  readonly km = km;
  readonly maxQty = MAX_QTY;

  /** O pedido como o cliente quer enviar (com endereco na entrega). */
  readonly request = computed<QuoteRequest>(() => ({
    items: this.cart.lines().map((l) => ({ productId: l.id, quantity: l.qty })),
    customerName: this.customerName().trim() || null,
    fulfillment: this.fulfillment(),
    notes: this.notes().trim() || null,
    address: this.fulfillment() === 'DELIVERY' && this.addressValid() ? toApiAddress(this.address()) : null,
  }));
  private readonly requestKey = computed(() => JSON.stringify(this.request()));

  /**
   * O que vai para o orcamento: enquanto o endereco esta incompleto, calcula so os totais (como retirada).
   * Como a chave nao bate com o pedido real, o botao de envio continua bloqueado ate o endereco ficar completo.
   */
  private readonly quoteRequest = computed<QuoteRequest>(() =>
    this.needsAddress() ? { ...this.request(), fulfillment: 'PICKUP', address: null } : this.request(),
  );

  /** So deixa enviar se o orcamento corresponde exatamente ao carrinho atual. */
  readonly canSend = computed(
    () => !this.quoting() && !!this.quote()?.whatsappText && this.quoteKey() === this.requestKey(),
  );
  /** Taxa de entrega do orcamento atual (so na entrega, com endereco completo). */
  readonly delivery = computed(() => (this.fulfillment() === 'DELIVERY' && !this.needsAddress() ? this.quote()?.delivery ?? null : null));
  readonly outOfArea = computed(() => {
    const d = this.delivery();
    return d?.status === 'OUT_OF_AREA' ? d : null;
  });
  readonly preview = computed(() => whatsappToHtml(this.quote()?.whatsappText ?? ''));
  readonly unavailableNames = computed(() => {
    const ids = new Set(this.quote()?.unavailable ?? []);
    return this.cart.lines().filter((l) => ids.has(l.id));
  });

  constructor() {
    combineLatest([toObservable(this.quoteRequest), toObservable(this.cart.isOpen)])
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

    effect(() => saveAddress(this.address()));

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
    window.open(this.site.whatsappLink(text), '_blank', 'noopener');
    this.sent.set(true);
  }

  finish(clear: boolean): void {
    if (clear) this.cart.clear();
    this.sent.set(false);
    if (clear) this.close();
  }
}
