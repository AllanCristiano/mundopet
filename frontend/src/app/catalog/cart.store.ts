import { Injectable, computed, effect, signal } from '@angular/core';

import { Product } from './catalog.models';

export const CART_STORAGE_KEY = 'mundopet-cart';
export const MAX_QTY = 20;
export const MAX_LINES = 30;

/** O que o carrinho guarda de cada produto (preco e so referencia: o servidor recalcula no orcamento). */
export interface CartLine {
  id: string;
  sku: string;
  name: string;
  brand: string;
  weightKg: number;
  color: string;
  price: number;
  effectivePrice: number;
  qty: number;
}

export type AddResult = 'added' | 'max-qty' | 'max-lines' | 'out-of-stock';

/**
 * Carrinho no aparelho (signals + localStorage).
 * Falha segura: sem localStorage (aba anonima/bloqueado) o carrinho funciona so durante a visita.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  readonly lines = signal<CartLine[]>(this.load());
  readonly count = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));
  readonly estimate = computed(() => this.lines().reduce((s, l) => s + l.effectivePrice * l.qty, 0));
  readonly isOpen = signal(false);
  /** Incrementa a cada adicao: dispara a animacao do icone do carrinho. */
  readonly bump = signal(0);

  constructor() {
    effect(() => this.save(this.lines()));
  }

  qtyOf(id: string): number {
    return this.lines().find((l) => l.id === id)?.qty ?? 0;
  }

  add(p: Product): AddResult {
    if (!p.inStock) return 'out-of-stock';
    const current = this.lines();
    const existing = current.find((l) => l.id === p.id);
    if (existing) {
      if (existing.qty >= MAX_QTY) return 'max-qty';
      this.lines.set(current.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l)));
    } else {
      if (current.length >= MAX_LINES) return 'max-lines';
      this.lines.set([
        ...current,
        {
          id: p.id,
          sku: p.sku,
          name: p.name,
          brand: p.brand,
          weightKg: p.weightKg,
          color: p.color,
          price: p.price,
          effectivePrice: p.effectivePrice,
          qty: 1,
        },
      ]);
    }
    this.bump.update((n) => n + 1);
    return 'added';
  }

  setQty(id: string, qty: number): void {
    if (qty <= 0) {
      this.remove(id);
      return;
    }
    const safe = Math.min(MAX_QTY, Math.floor(qty));
    this.lines.update((ls) => ls.map((l) => (l.id === id ? { ...l, qty: safe } : l)));
  }

  inc(id: string): void {
    this.setQty(id, this.qtyOf(id) + 1);
  }

  dec(id: string): void {
    this.setQty(id, this.qtyOf(id) - 1);
  }

  remove(id: string): void {
    this.lines.update((ls) => ls.filter((l) => l.id !== id));
  }

  removeMany(ids: string[]): void {
    const set = new Set(ids);
    this.lines.update((ls) => ls.filter((l) => !set.has(l.id)));
  }

  clear(): void {
    this.lines.set([]);
  }

  private load(): CartLine[] {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      // descarta lixo/versoes antigas e respeita os limites
      return parsed
        .filter((l): l is CartLine => !!l && typeof l.id === 'string' && Number.isFinite(l.qty) && l.qty > 0)
        .slice(0, MAX_LINES)
        .map((l) => ({ ...l, qty: Math.min(MAX_QTY, Math.floor(l.qty)) }));
    } catch {
      return [];
    }
  }

  private save(lines: CartLine[]): void {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // armazenamento indisponivel: carrinho segue so em memoria
    }
  }
}
