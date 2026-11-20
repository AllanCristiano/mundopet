import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { BagArt } from './bag-art';
import { CartStore, MAX_QTY } from './cart.store';
import { LINE_LABEL, Product, SIZE_LABEL, STAGE_LABEL, kg, money } from './catalog.models';
import { ToastService } from './toast.service';

export const ADD_MESSAGES = {
  added: 'Adicionado ao carrinho 🛒',
  'max-qty': `Máximo de ${MAX_QTY} unidades por produto`,
  'max-lines': 'Carrinho cheio: finalize este pedido primeiro',
  'out-of-stock': 'Produto indisponível no momento',
} as const;

@Component({
  selector: 'app-product-card',
  imports: [BagArt],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
})
export class ProductCard {
  readonly product = input.required<Product>();
  readonly index = input(0);

  private readonly cart = inject(CartStore);
  private readonly toast = inject(ToastService);

  readonly qty = computed(() => this.cart.qtyOf(this.product().id));
  readonly money = money;
  readonly kg = kg;
  readonly meta = computed(() => {
    const p = this.product();
    return [STAGE_LABEL[p.lifeStage], SIZE_LABEL[p.petSize], LINE_LABEL[p.line]];
  });

  add(): void {
    this.toast.show(ADD_MESSAGES[this.cart.add(this.product())]);
  }

  inc(): void {
    if (this.qty() >= MAX_QTY) {
      this.toast.show(ADD_MESSAGES['max-qty']);
      return;
    }
    this.cart.inc(this.product().id);
  }

  dec(): void {
    this.cart.dec(this.product().id);
  }
}
