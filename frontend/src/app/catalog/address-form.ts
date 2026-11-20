import { Component, DestroyRef, ElementRef, inject, model, signal, viewChild } from '@angular/core';
import { Subscription } from 'rxjs';

import { AddressApi, DeliveryAddress, UFS, cepDigits, maskCep } from './address';

export type LookupState = 'idle' | 'loading' | 'found' | 'not-found' | 'error';

/**
 * Endereco de entrega comecando pelo CEP.
 * 8 digitos => consulta automatica, preenche rua/bairro/cidade/UF e leva o foco para o numero.
 * Todos os campos continuam editaveis (CEP generico, rua errada, etc.).
 */
@Component({
  selector: 'app-address-form',
  templateUrl: './address-form.html',
  styleUrl: './address-form.scss',
})
export class AddressForm {
  readonly address = model.required<DeliveryAddress>();
  readonly state = signal<LookupState>('idle');
  readonly message = signal<string | null>(null);
  readonly flash = signal(false);
  readonly ufs = UFS;

  private readonly api = inject(AddressApi);
  private readonly numberInput = viewChild<ElementRef<HTMLInputElement>>('numberInput');
  private lookupSub?: Subscription;
  private lastLooked = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.lookupSub?.unsubscribe());
  }

  patch(p: Partial<DeliveryAddress>): void {
    this.address.update((a) => ({ ...a, ...p }));
  }

  onCep(raw: string, input?: HTMLInputElement): void {
    const masked = maskCep(raw);
    if (input && input.value !== masked) input.value = masked;
    this.patch({ cep: masked });
    const digits = cepDigits(masked);
    if (digits.length === 8 && digits !== this.lastLooked) {
      this.lookup(digits);
    } else if (digits.length < 8) {
      this.lastLooked = '';
      this.state.set('idle');
      this.message.set(null);
    }
  }

  lookup(digits: string): void {
    this.lastLooked = digits;
    this.lookupSub?.unsubscribe();
    this.state.set('loading');
    this.message.set(null);
    this.lookupSub = this.api.lookup(digits).subscribe({
      next: (r) => {
        // so sobrescreve o que o CEP informa; numero/complemento/referencia ficam com o cliente
        this.patch({
          cep: r.cep,
          street: r.street || this.address().street,
          district: r.district || this.address().district,
          city: r.city,
          state: r.state,
        });
        this.state.set('found');
        this.message.set(r.street ? 'Endereço encontrado! Confira e informe o número.' : 'CEP geral da cidade: preencha a rua e o bairro.');
        this.flash.set(true);
        setTimeout(() => this.flash.set(false), 1200);
        setTimeout(() => this.numberInput()?.nativeElement.focus(), 50);
      },
      error: (e: Error & { status?: number }) => {
        this.state.set(e.status === 404 ? 'not-found' : 'error');
        this.message.set(
          e.status === 404
            ? 'CEP não encontrado. Confira o número ou preencha o endereço manualmente.'
            : 'Não conseguimos consultar o CEP agora. Preencha o endereço manualmente.',
        );
      },
    });
  }

  toggleNoNumber(checked: boolean): void {
    this.patch({ number: checked ? 'S/N' : '' });
    if (!checked) setTimeout(() => this.numberInput()?.nativeElement.focus(), 0);
  }
}
