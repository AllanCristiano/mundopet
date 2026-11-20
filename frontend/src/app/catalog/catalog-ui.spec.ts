import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { CART_STORAGE_KEY, CartStore, MAX_QTY } from './cart.store';
import { CartDrawer } from './cart-drawer';
import { CATALOG_API } from './catalog.api';
import { EMPTY_FILTERS, Quote } from './catalog.models';
import { CatalogFilters } from './catalog-filters';
import { CatalogPage, PAGE_SIZE } from './catalog-page';
import { makeProduct } from './catalog-logic.spec';
import { ProductCard } from './product-card';
import { ToastService } from './toast.service';

const page = (items = [makeProduct()], total = items.length, hasMore = false) => ({ items, total, page: 0, pageSize: PAGE_SIZE, hasMore });
const facets = { brands: { 'Vita Pet': 3, NutriPata: 2 }, prices: { min: 10, max: 300, promoCount: 4, total: 5 } };

describe('catalogo (UI)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem(CART_STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => localStorage.removeItem(CART_STORAGE_KEY));

  describe('ProductCard', () => {
    function render(p = makeProduct()) {
      const f = TestBed.createComponent(ProductCard);
      f.componentRef.setInput('product', p);
      f.detectChanges();
      return { f, el: f.nativeElement as HTMLElement };
    }

    it('mostra desconto, preco de/por e preco por kg', () => {
      const { el } = render();
      expect(el.querySelector('.badge.promo')!.textContent).toContain('-20%');
      expect(el.querySelector('s')!.textContent).toContain('R$ 100,00');
      expect(el.querySelector('strong')!.textContent).toContain('R$ 80,00');
      expect(el.textContent).toContain('R$ 8,00/kg');
    });

    it('adicionar vira seletor de quantidade; diminuir ate zero remove', () => {
      const { f, el } = render();
      const toast = TestBed.inject(ToastService);
      el.querySelector<HTMLButtonElement>('.add')!.click();
      f.detectChanges();
      expect(toast.message()).toContain('Adicionado');
      el.querySelector<HTMLButtonElement>('[aria-label="Aumentar"]')!.click();
      f.detectChanges();
      expect(el.querySelector('output')!.textContent).toBe('2');
      el.querySelector<HTMLButtonElement>('[aria-label="Diminuir"]')!.click();
      el.querySelector<HTMLButtonElement>('.stepper button')!.click();
      f.detectChanges();
      expect(el.querySelector('.add')).not.toBeNull();
    });

    it('limite de quantidade avisa e nao passa de ' + MAX_QTY, () => {
      const { f, el } = render();
      const cart = TestBed.inject(CartStore);
      cart.add(makeProduct());
      cart.setQty('p1', MAX_QTY);
      f.detectChanges();
      el.querySelector<HTMLButtonElement>('[aria-label="Aumentar"]')!.click();
      expect(cart.qtyOf('p1')).toBe(MAX_QTY);
      expect(TestBed.inject(ToastService).message()).toContain('Máximo');
    });

    it('esgotado: botao desabilitado e selo', () => {
      const { el } = render(makeProduct({ inStock: false, line: 'TERAPEUTICA', promoPrice: null, discountPercent: null }));
      expect(el.querySelector<HTMLButtonElement>('.add')!.disabled).toBeTrue();
      expect(el.querySelector('.badge.out')).not.toBeNull();
      expect(el.querySelector('.badge.vet')).not.toBeNull();
    });
  });

  describe('CatalogFilters', () => {
    function render(filters = EMPTY_FILTERS) {
      const f = TestBed.createComponent(CatalogFilters);
      f.componentRef.setInput('filters', filters);
      f.componentRef.setInput('facets', facets);
      f.detectChanges();
      const emitted: unknown[] = [];
      f.componentInstance.changed.subscribe((v) => emitted.push(v));
      let cleared = false;
      f.componentInstance.cleared.subscribe(() => (cleared = true));
      return { f, el: f.nativeElement as HTMLElement, emitted, isCleared: () => cleared };
    }

    it('emite mudancas de cada grupo de filtro', () => {
      const { f, el, emitted, isCleared } = render();
      const c = f.componentInstance;
      (el.querySelector('.promo input') as HTMLInputElement).dispatchEvent(new Event('change'));
      el.querySelectorAll<HTMLButtonElement>('.seg button')[2].click();
      c.toggleStage('FILHOTE');
      c.toggleSize('GRANDE');
      c.toggleLine('NATURAL');
      c.toggleBrand('Vita Pet');
      c.setRange(PRICE_RANGES_FIRST);
      c.priceInput('minPrice', '50');
      c.priceInput('maxPrice', '');
      c.priceInput('maxPrice', 'abc');
      el.querySelector<HTMLButtonElement>('.clear')!.click();
      expect(emitted).toEqual([
        { promo: true }, { species: 'GATO' }, { stage: ['FILHOTE'] }, { petSize: ['GRANDE'] }, { line: ['NATURAL'] },
        { brand: ['Vita Pet'] }, { minPrice: null, maxPrice: 100 }, { minPrice: 50 }, { maxPrice: null }, { maxPrice: null },
      ]);
      expect(isCleared()).toBeTrue();
      expect(el.textContent).toContain('4 ofertas ativas');
      expect(el.querySelectorAll('.check').length).toBe(2);
    });

    it('faixa ja ativa e desmarcada; gatos escondem o filtro de porte', () => {
      const { f, el, emitted } = render({ ...EMPTY_FILTERS, species: 'GATO', minPrice: null, maxPrice: 100 });
      expect(f.componentInstance.isRange(PRICE_RANGES_FIRST)).toBeTrue();
      f.componentInstance.setRange(PRICE_RANGES_FIRST);
      expect(emitted).toEqual([{ minPrice: null, maxPrice: null }]);
      expect(el.textContent).not.toContain('Porte');
    });
  });

  describe('CartDrawer', () => {
    const quote: Quote = {
      lines: [{ productId: 'p1', sku: 'SKU1', name: 'Ração Teste', brand: 'Vita Pet', weightKg: 10, quantity: 2, unitPrice: 80,
        originalUnitPrice: 100, lineTotal: 160, promo: true, warning: 'Apenas 1 em estoque' }],
      unavailable: ['p2'], itemsCount: 2, subtotal: 200, discount: 40, itemsTotal: 160, deliveryFee: 0, total: 160, delivery: null,
      whatsappText: '🐾 *MUNDOPET* pedido\n✅ *TOTAL: R$ 160,00*',
    };

    function setup() {
      const cart = TestBed.inject(CartStore);
      cart.add(makeProduct());
      cart.add(makeProduct());
      cart.add(makeProduct({ id: 'p2', name: 'Esgotada' }));
      const f = TestBed.createComponent(CartDrawer);
      f.detectChanges();
      return { f, cart, el: f.nativeElement as HTMLElement };
    }

    it('vazio mostra convite para ver racoes e nao chama a API', fakeAsync(() => {
      const f = TestBed.createComponent(CartDrawer);
      TestBed.inject(CartStore).isOpen.set(true);
      f.detectChanges();
      tick(400);
      expect((f.nativeElement as HTMLElement).textContent).toContain('carrinho está vazio');
      http.expectNone(`${CATALOG_API}/cart/quote`);
    }));

    it('aberto: pede orcamento ao servidor, mostra totais, aviso, indisponiveis e envia pelo WhatsApp', fakeAsync(() => {
      const { f, cart, el } = setup();
      cart.isOpen.set(true);
      f.detectChanges();
      tick(400);
      const req = http.expectOne(`${CATALOG_API}/cart/quote`);
      expect(req.request.body.items).toEqual([{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }]);
      req.flush(quote);
      f.detectChanges();

      expect(el.querySelector('.tot')!.textContent).toContain('R$ 160,00');
      expect(el.querySelector('.disc')!.textContent).toContain('R$ 40,00');
      expect(el.textContent).toContain('Apenas 1 em estoque');
      expect(el.querySelector('.alert')!.textContent).toContain('Esgotada');

      el.querySelector<HTMLButtonElement>('.preview-toggle')!.click();
      f.detectChanges();
      expect(el.querySelector('.bubble')!.innerHTML).toContain('<b>TOTAL: R$ 160,00</b>');

      const open = spyOn(window, 'open');
      el.querySelector<HTMLButtonElement>('.wa')!.click();
      expect(open).toHaveBeenCalled();
      const url = open.calls.mostRecent().args[0] as string;
      expect(url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
      expect(decodeURIComponent(url.split('text=')[1])).toBe(quote.whatsappText!);
      f.detectChanges();
      expect(el.textContent).toContain('Pedido enviado');

      f.componentInstance.finish(true);
      expect(cart.count()).toBe(0);
      expect(cart.isOpen()).toBeFalse();
    }));

    it('carrinho mudou depois do orcamento: bloqueia envio ate recalcular', fakeAsync(() => {
      const { f, cart } = setup();
      cart.isOpen.set(true);
      f.detectChanges();
      tick(400);
      http.expectOne(`${CATALOG_API}/cart/quote`).flush(quote);
      expect(f.componentInstance.canSend()).toBeTrue();
      f.componentInstance.notes.set('troco para 100');
      f.detectChanges();
      expect(f.componentInstance.canSend()).toBeFalse();
      const open = spyOn(window, 'open');
      f.componentInstance.send();
      expect(open).not.toHaveBeenCalled();
      tick(400);
      http.expectOne(`${CATALOG_API}/cart/quote`).flush(quote);
      expect(f.componentInstance.canSend()).toBeTrue();
      f.componentInstance.removeUnavailable();
      expect(cart.qtyOf('p2')).toBe(0);
      f.componentInstance.finish(false);
      expect(cart.count()).toBe(2);
    }));

    it('entrega: sem endereco completo nao envia; com endereco o pedido leva o endereco', fakeAsync(() => {
      localStorage.removeItem('mundopet-address');
      const { f, cart, el } = setup();
      cart.isOpen.set(true);
      f.componentInstance.fulfillment.set('DELIVERY');
      f.detectChanges();
      tick(400);
      // so para calcular os totais (como retirada); envio bloqueado
      const totals = http.expectOne(`${CATALOG_API}/cart/quote`);
      expect(totals.request.body.fulfillment).toBe('PICKUP');
      expect(totals.request.body.address).toBeNull();
      totals.flush(quote);
      f.detectChanges();
      expect(el.querySelector('app-address-form')).not.toBeNull();
      expect(el.querySelector('.hint')!.textContent).toContain('endereço de entrega');
      expect(f.componentInstance.canSend()).toBeFalse();

      f.componentInstance.address.set({ cep: '01001000', street: 'Praça da Sé', number: '100', complement: '', district: 'Sé',
        city: 'São Paulo', state: 'SP', reference: '' });
      f.detectChanges();
      tick(400);
      const full = http.expectOne(`${CATALOG_API}/cart/quote`);
      expect(full.request.body.fulfillment).toBe('DELIVERY');
      expect(full.request.body.address).toEqual(jasmine.objectContaining({ cep: '01001-000', number: '100', state: 'SP' }));
      full.flush(quote);
      f.detectChanges();
      expect(f.componentInstance.canSend()).toBeTrue();
      expect(el.querySelector('.hint')).toBeNull();
      expect(JSON.parse(localStorage.getItem('mundopet-address')!).number).toBe('100');
      localStorage.removeItem('mundopet-address');
    }));

    it('entrega: mostra a taxa por km, "a combinar" ou fora da area', fakeAsync(() => {
      localStorage.setItem('mundopet-address', JSON.stringify({ cep: '01001-000', street: 'Praça da Sé', number: '100', complement: '',
        district: 'Sé', city: 'São Paulo', state: 'SP', reference: '' }));
      const { f, cart, el } = setup();
      cart.isOpen.set(true);
      f.componentInstance.fulfillment.set('DELIVERY');
      f.detectChanges();
      tick(400);
      const sum = () => el.querySelector('.sum')!.textContent!.replace(/\s+/g, ' ');

      http.expectOne(`${CATALOG_API}/cart/quote`).flush({ ...quote, deliveryFee: 6.4, total: 166.4,
        delivery: { status: 'OK', distanceKm: 3.2, fee: 6.4, pricePerKm: 2, maxKm: 15 } });
      f.detectChanges();
      expect(sum()).toContain('Produtos');
      expect(sum()).toContain('3,2 km');
      expect(sum()).toContain('/km');
      expect(sum()).toMatch(/Entrega.*6,40/);
      expect(sum()).toMatch(/Total.*166,40/);
      expect(f.componentInstance.canSend()).toBeTrue();

      f.componentInstance.address.update((a) => ({ ...a, number: '200' }));
      f.detectChanges();
      tick(400);
      http.expectOne(`${CATALOG_API}/cart/quote`).flush({ ...quote, delivery: { status: 'UNKNOWN', distanceKm: null, fee: null, pricePerKm: 2, maxKm: 15 } });
      f.detectChanges();
      expect(sum()).toContain('a combinar');
      expect(f.componentInstance.canSend()).toBeTrue();

      f.componentInstance.address.update((a) => ({ ...a, number: '300' }));
      f.detectChanges();
      tick(400);
      http.expectOne(`${CATALOG_API}/cart/quote`).flush({ ...quote, whatsappText: null,
        delivery: { status: 'OUT_OF_AREA', distanceKm: 40.5, fee: null, pricePerKm: 2, maxKm: 15 } });
      f.detectChanges();
      const out = el.querySelector('.hint.out')!;
      expect(out.textContent).toContain('40,5 km');
      expect(out.textContent).toContain('15 km');
      expect(f.componentInstance.canSend()).toBeFalse();

      // atalho: trocar para retirada
      out.querySelector('button')!.click();
      f.detectChanges();
      expect(f.componentInstance.fulfillment()).toBe('PICKUP');
      tick(400);
      http.expectOne(`${CATALOG_API}/cart/quote`).flush(quote);
      localStorage.removeItem('mundopet-address');
    }));

    it('falha no orcamento: mostra erro e nao deixa enviar', fakeAsync(() => {
      const { f, cart, el } = setup();
      cart.isOpen.set(true);
      f.detectChanges();
      tick(400);
      http.expectOne(`${CATALOG_API}/cart/quote`).flush('', { status: 503, statusText: 'x' });
      f.detectChanges();
      expect(el.querySelector('.error')!.textContent).toContain('indisponivel');
      expect(el.querySelector<HTMLButtonElement>('.wa')!.disabled).toBeTrue();
      f.componentInstance.close();
      expect(cart.isOpen()).toBeFalse();
    }));
  });

  describe('CatalogPage', () => {
    function render() {
      const f = TestBed.createComponent(CatalogPage);
      f.detectChanges();
      return { f, c: f.componentInstance, el: f.nativeElement as HTMLElement };
    }

    function flushInitial(items = [makeProduct()], hasMore = false) {
      http.expectOne(`${CATALOG_API}/facets`).flush(facets);
      http.expectOne((r) => r.url === `${CATALOG_API}/products` && String(r.params.get('promo')) === 'true').flush(page([makeProduct({ id: 'o1', promoEndsAt: new Date(Date.now() + 3600e3).toISOString() })]));
      tick(600);
      http.expectOne((r) => r.url === `${CATALOG_API}/products` && !r.params.has('promo')).flush(page(items, items.length + (hasMore ? 10 : 0), hasMore));
    }

    it('carrega ofertas, facetas e produtos; filtros vao para o link', fakeAsync(() => {
      const { f, c, el } = render();
      flushInitial();
      f.detectChanges();
      expect(el.querySelectorAll('app-product-card').length).toBe(1);
      expect(el.querySelector('.offer')!.textContent).toContain('termina em');
      expect(el.textContent).toContain('1 ração encontrada');

      const nav = spyOn(TestBed.inject(Router), 'navigate');
      c.update({ species: 'GATO', promo: true, brand: ['Vita Pet'], stage: ['FILHOTE'], petSize: ['PEQUENO'], line: ['NATURAL'], minPrice: 10, maxPrice: 50 });
      f.detectChanges(); // roda os effects (toObservable) apos mudar os filtros
      tick(600);
      http.expectOne((r) => r.params.get('species') === 'GATO').flush(page([], 0));
      f.detectChanges();
      expect(nav).toHaveBeenCalled();
      expect(c.chips().length).toBe(7);
      expect(el.textContent).toContain('Nenhuma ração encontrada');

      el.querySelector<HTMLButtonElement>('.summary .chips button')!.click();
      expect(c.filters().promo).toBeFalse();
      c.clearAll();
      expect(c.filters().species).toBeNull();
      f.detectChanges(); // roda os effects (toObservable) apos mudar os filtros
      tick(600);
      http.expectOne((r) => r.url === `${CATALOG_API}/products`).flush(page());
    }));

    it('busca digitada usa debounce (uma requisicao) e carrega mais paginas', fakeAsync(() => {
      const { f, c } = render();
      flushInitial([makeProduct()], true);
      f.detectChanges();
      c.search('r');
      c.search('ra');
      c.search('racao');
      f.detectChanges(); // roda os effects (toObservable) apos mudar os filtros
      tick(600);
      http.expectOne((r) => r.params.get('q') === 'racao').flush(page([makeProduct()], 30, true));
      c.loadMore();
      c.loadMore(); // ignorado enquanto carrega
      http.expectOne((r) => String(r.params.get('page')) === '1').flush({ ...page([makeProduct({ id: 'p9' })], 30, false), page: 1 });
      expect(c.items().length).toBe(2);
      expect(c.hasMore()).toBeFalse();
      c.loadMore();
      http.expectNone((r) => String(r.params.get('page')) === '2');
    }));

    it('falha ao buscar: mensagem + tentar novamente; falha no "carregar mais" vira aviso', fakeAsync(() => {
      const { f, c, el } = render();
      http.expectOne(`${CATALOG_API}/facets`).flush('', { status: 500, statusText: 'x' });
      http.expectOne((r) => String(r.params.get('promo')) === 'true').flush('', { status: 500, statusText: 'x' });
      f.detectChanges(); // roda os effects (toObservable) apos mudar os filtros
      tick(600);
      http.expectOne((r) => r.url === `${CATALOG_API}/products`).flush('', { status: 429, statusText: 'x' });
      f.detectChanges();
      expect(el.querySelector('.state')!.textContent).toContain('Muitas requisi');
      expect(c.facets()).toBeNull();

      c.retry();
      f.detectChanges(); // roda os effects (toObservable) apos mudar os filtros
      tick(600);
      http.expectOne((r) => r.url === `${CATALOG_API}/products`).flush(page([makeProduct()], 20, true));
      c.loadMore();
      http.expectOne((r) => String(r.params.get('page')) === '1').flush('', { status: 400, statusText: 'x' });
      expect(TestBed.inject(ToastService).message()).toBe('Dados invalidos.');
    }));

    it('ofertas: adicionar pela vitrine e abrir o carrinho', fakeAsync(() => {
      const { f, c, el } = render();
      flushInitial();
      f.detectChanges();
      el.querySelector<HTMLButtonElement>('.oadd')!.click();
      expect(TestBed.inject(CartStore).count()).toBe(1);
      expect(TestBed.inject(ToastService).message()).toContain('Oferta adicionada');
      c.addOffer(makeProduct({ inStock: false }));
      expect(TestBed.inject(ToastService).message()).toContain('Não foi possível');
      f.detectChanges();
      el.querySelector<HTMLButtonElement>('.float-cart')!.click();
      expect(TestBed.inject(CartStore).isOpen()).toBeTrue();
      f.destroy();
    }));
  });
});

const PRICE_RANGES_FIRST = { label: 'Até R$ 100', min: null, max: 100 };
