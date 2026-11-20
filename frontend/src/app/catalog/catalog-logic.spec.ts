import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';

import { CART_STORAGE_KEY, CartStore, MAX_LINES, MAX_QTY } from './cart.store';
import { CATALOG_API, CatalogApi, toParams } from './catalog.api';
import { EMPTY_FILTERS, Product, kg, money } from './catalog.models';
import { filtersFromParams, filtersToParams, timeLeft } from './catalog-page';
import { PRICE_RANGES, toggle } from './catalog-filters';
import { whatsappToHtml } from './whatsapp-format';

export function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: 'p1', sku: 'SKU1', name: 'Ração Teste', brand: 'Vita Pet', species: 'CAO', lifeStage: 'ADULTO',
    petSize: 'TODOS', line: 'PREMIUM', flavor: null, weightKg: 10, price: 100, promoPrice: 80,
    promoEndsAt: null, discountPercent: 20, effectivePrice: 80, pricePerKg: 8, stock: 5, inStock: true,
    color: '#3d7bd9', description: null, ...over,
  };
}

describe('CartStore', () => {
  beforeEach(() => localStorage.removeItem(CART_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(CART_STORAGE_KEY));

  const store = () => TestBed.inject(CartStore);

  it('adiciona, soma quantidade, calcula contagem/estimativa e persiste', () => {
    const cart = store();
    expect(cart.add(makeProduct())).toBe('added');
    expect(cart.add(makeProduct())).toBe('added');
    cart.add(makeProduct({ id: 'p2', effectivePrice: 50 }));
    expect(cart.count()).toBe(3);
    expect(cart.estimate()).toBe(210);
    expect(cart.bump()).toBe(3);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)!).length).toBe(2);
  });

  it('respeita limites e estoque', () => {
    const cart = store();
    expect(cart.add(makeProduct({ inStock: false }))).toBe('out-of-stock');
    cart.add(makeProduct());
    cart.setQty('p1', 999);
    expect(cart.qtyOf('p1')).toBe(MAX_QTY);
    expect(cart.add(makeProduct())).toBe('max-qty');
    for (let i = 1; i < MAX_LINES; i++) cart.add(makeProduct({ id: `x${i}` }));
    expect(cart.add(makeProduct({ id: 'extra' }))).toBe('max-lines');
  });

  it('inc/dec/remove/removeMany/clear', () => {
    const cart = store();
    cart.add(makeProduct());
    cart.add(makeProduct({ id: 'p2' }));
    cart.inc('p1');
    expect(cart.qtyOf('p1')).toBe(2);
    cart.dec('p1');
    cart.dec('p1');
    expect(cart.qtyOf('p1')).toBe(0);
    cart.add(makeProduct({ id: 'p3' }));
    cart.removeMany(['p2']);
    expect(cart.lines().map((l) => l.id)).toEqual(['p3']);
    cart.clear();
    expect(cart.count()).toBe(0);
  });

  it('restaura do armazenamento descartando lixo e limitando quantidade', () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ id: 'a', qty: 50 }, { id: 'b', qty: -1 }, null, { qty: 2 }]));
    const lines = store().lines();
    expect(lines.length).toBe(1);
    expect(lines[0].qty).toBe(MAX_QTY);
  });

  it('falha segura: JSON corrompido ou storage bloqueado nao quebram o carrinho', () => {
    localStorage.setItem(CART_STORAGE_KEY, '{quebrado');
    expect(store().lines()).toEqual([]);
  });

  it('falha segura: setItem bloqueado', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceeded');
    const cart = store();
    cart.add(makeProduct());
    expect(() => TestBed.tick()).not.toThrow();
    expect(cart.count()).toBe(1);
  });

  it('dados antigos que nao sao lista sao ignorados', () => {
    localStorage.setItem(CART_STORAGE_KEY, '{"a":1}');
    expect(store().lines()).toEqual([]);
  });
});

describe('CatalogApi', () => {
  let api: CatalogApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(CatalogApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('toParams envia so filtros preenchidos e corta busca longa', () => {
    const p = toParams({ ...EMPTY_FILTERS, q: '  ' + 'x'.repeat(80), species: 'GATO', stage: ['FILHOTE', 'SENIOR'],
      petSize: ['PEQUENO'], line: ['NATURAL'], brand: ['Vita Pet'], minPrice: 10, maxPrice: 0, promo: true }, 2, 12);
    expect(p.get('q')!.length).toBe(60);
    expect(p.getAll('stage')).toEqual(['FILHOTE', 'SENIOR']);
    expect(p.get('maxPrice')).toBe('0');
    expect(p.get('promo')).toBe('true');
    expect(p.get('page')).toBe('2');
    const empty = toParams(EMPTY_FILTERS, 0, 12);
    expect(empty.keys().sort()).toEqual(['page', 'pageSize', 'sort']);
  });

  it('busca repete em 503 e recupera', fakeAsync(() => {
    let total = -1;
    api.search(EMPTY_FILTERS).subscribe((r) => (total = r.total));
    http.expectOne((r) => r.url === `${CATALOG_API}/products`).flush('', { status: 503, statusText: 'x' });
    tick(400);
    http.expectOne((r) => r.url === `${CATALOG_API}/products`).flush({ items: [], total: 7, page: 0, pageSize: 12, hasMore: false });
    expect(total).toBe(7);
  }));

  it('429 nao repete e vira mensagem amigavel', () => {
    let msg = '';
    api.facets().subscribe({ error: (e: Error) => (msg = e.message) });
    http.expectOne(`${CATALOG_API}/facets`).flush('', { status: 429, statusText: 'x' });
    expect(msg).toContain('Muitas');
  });

  it('orcamento: erro do servidor vira mensagem amigavel', () => {
    let msg = '';
    api.quote({ items: [{ productId: 'p1', quantity: 1 }], customerName: null, fulfillment: 'PICKUP', notes: null })
      .subscribe({ error: (e: Error) => (msg = e.message) });
    const req = http.expectOne(`${CATALOG_API}/cart/quote`);
    expect(req.request.method).toBe('POST');
    req.flush({}, { status: 400, statusText: 'x' });
    expect(msg).toBe('Dados invalidos.');
  });
});

describe('helpers do catalogo', () => {
  it('filtros <-> link: ida e volta, ignorando valores invalidos', () => {
    const f = { ...EMPTY_FILTERS, q: 'salmão', species: 'GATO' as const, stage: ['ADULTO' as const], brand: ['Vita Pet'],
      minPrice: 10, promo: true, sort: 'DISCOUNT' as const };
    const params = filtersToParams(f);
    expect(params['sort']).toBe('DISCOUNT');
    expect(filtersToParams(EMPTY_FILTERS)['sort']).toBeNull();

    const back = filtersFromParams(convertToParamMap({ ...params, stage: ['ADULTO', 'BEBE'], species: 'GATO', petSize: 'XXL', sort: 'HACK', maxPrice: 'abc' }));
    expect(back.q).toBe('salmão');
    expect(back.stage).toEqual(['ADULTO']);
    expect(back.petSize).toEqual([]);
    expect(back.sort).toBe('RELEVANCE');
    expect(back.maxPrice).toBeNull();
    expect(back.minPrice).toBe(10);
    expect(back.promo).toBeTrue();
    expect(filtersFromParams(convertToParamMap({ species: 'PEIXE' })).species).toBeNull();
  });

  it('contagem regressiva', () => {
    const now = Date.UTC(2026, 0, 1, 0, 0);
    expect(timeLeft(null, now)).toBeNull();
    expect(timeLeft(new Date(now - 1).toISOString(), now)).toBe('encerrada');
    expect(timeLeft(new Date(now + (2 * 1440 + 5 * 60) * 60000).toISOString(), now)).toBe('termina em 2d 05h');
    expect(timeLeft(new Date(now + (3 * 60 + 7) * 60000).toISOString(), now)).toBe('termina em 3h 07min');
  });

  it('toggle e faixas de preco', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
    expect(PRICE_RANGES.length).toBe(4);
  });

  it('formatacao de dinheiro e peso', () => {
    expect(money(1234.5)).toBe('R$ 1.234,50');
    expect(kg(7.5)).toBe('7,5 kg');
  });

  it('pre-visualizacao do WhatsApp aplica formatacao e NAO injeta HTML', () => {
    const html = whatsappToHtml('*Total* ~R$ 10~ _obs_\n<img src=x onerror=alert(1)>');
    expect(html).toContain('<b>Total</b>');
    expect(html).toContain('<s>R$ 10</s>');
    expect(html).toContain('<i>obs</i>');
    expect(html).toContain('<br>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
