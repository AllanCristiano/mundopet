import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import {
  ADDRESS_STORAGE_KEY,
  AddressApi,
  DeliveryAddress,
  EMPTY_ADDRESS,
  cepDigits,
  isAddressValid,
  loadAddress,
  maskCep,
  saveAddress,
  toApiAddress,
} from './address';
import { AddressForm } from './address-form';

const FULL: DeliveryAddress = {
  cep: '01001-000', street: 'Praça da Sé', number: '100', complement: '', district: 'Sé', city: 'São Paulo', state: 'sp', reference: '',
};

describe('endereco (helpers)', () => {
  afterEach(() => localStorage.removeItem(ADDRESS_STORAGE_KEY));

  it('mascara e digitos do CEP', () => {
    expect(maskCep('01001000')).toBe('01001-000');
    expect(maskCep('0100')).toBe('0100');
    expect(maskCep('01.001-000999')).toBe('01001-000');
    expect(cepDigits('01001-000')).toBe('01001000');
  });

  it('validacao exige CEP, rua, numero, bairro, cidade e UF valida', () => {
    expect(isAddressValid(FULL)).toBeTrue();
    expect(isAddressValid({ ...FULL, number: ' ' })).toBeFalse();
    expect(isAddressValid({ ...FULL, cep: '0100' })).toBeFalse();
    expect(isAddressValid({ ...FULL, state: 'XX' })).toBeFalse();
    expect(isAddressValid(EMPTY_ADDRESS)).toBeFalse();
  });

  it('formato da API: UF maiuscula, opcionais vazios viram null', () => {
    expect(toApiAddress({ ...FULL, cep: '01001000' })).toEqual({
      cep: '01001-000', street: 'Praça da Sé', number: '100', complement: null, district: 'Sé', city: 'São Paulo', state: 'SP', reference: null,
    });
  });

  it('salva e carrega do aparelho, ignorando lixo', () => {
    saveAddress(FULL);
    expect(loadAddress()).toEqual(FULL);
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify({ street: 123, city: 'X'.repeat(500), hack: 'y' }));
    const a = loadAddress();
    expect(a.street).toBe('');
    expect(a.city.length).toBe(120);
    expect((a as unknown as Record<string, unknown>)['hack']).toBeUndefined();
    localStorage.setItem(ADDRESS_STORAGE_KEY, '{quebrado');
    expect(loadAddress()).toEqual(EMPTY_ADDRESS);
    localStorage.setItem(ADDRESS_STORAGE_KEY, 'null');
    expect(loadAddress()).toEqual(EMPTY_ADDRESS);
  });

  it('falha segura com armazenamento bloqueado', () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceeded');
    expect(() => saveAddress(FULL)).not.toThrow();
  });
});

@Component({
  imports: [AddressForm],
  template: `<app-address-form [(address)]="address" />`,
})
class Host {
  address = signal<DeliveryAddress>({ ...EMPTY_ADDRESS, number: '', complement: 'Apto 1' });
}

describe('AddressForm', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function render() {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const cep = el.querySelector<HTMLInputElement>('.cep input')!;
    const type = (v: string) => {
      cep.value = v;
      cep.dispatchEvent(new Event('input'));
      f.detectChanges();
    };
    return { f, el, type, host: f.componentInstance };
  }

  it('CEP completo busca, preenche (sem apagar o complemento), avisa e foca o numero', fakeAsync(() => {
    const { f, el, type, host } = render();
    type('0100');
    http.expectNone(() => true);
    type('01001000');
    expect(el.querySelector<HTMLInputElement>('.cep input')!.value).toBe('01001-000');
    expect(el.querySelector('.cep-input')!.getAttribute('data-state')).toBe('loading');
    http.expectOne('/api/address/cep/01001000').flush({ cep: '01001-000', street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP', source: 'ViaCEP' });
    f.detectChanges();
    tick(60);

    expect(host.address()).toEqual(jasmine.objectContaining({ street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP', complement: 'Apto 1' }));
    expect(el.querySelector('.msg')!.textContent).toContain('informe o número');
    expect(document.activeElement).toBe(el.querySelector('.number input'));
    expect(el.querySelector('.address')!.classList).toContain('flash');
    tick(1200);
    f.detectChanges();
    expect(el.querySelector('.address')!.classList).not.toContain('flash');

    // mesmo CEP de novo nao consulta outra vez
    type('01001-000');
    http.expectNone('/api/address/cep/01001000');
  }));

  it('CEP geral da cidade (sem rua) pede para preencher rua e bairro', fakeAsync(() => {
    const { f, el, type, host } = render();
    host.address.update((a) => ({ ...a, street: 'Rua que o cliente digitou' }));
    f.detectChanges();
    type('13560000');
    http.expectOne('/api/address/cep/13560000').flush({ cep: '13560-000', street: '', district: '', city: 'São Carlos', state: 'SP', source: 'ViaCEP' });
    f.detectChanges();
    tick(1300);
    expect(host.address().street).toBe('Rua que o cliente digitou');
    expect(el.querySelector('.msg')!.textContent).toContain('preencha a rua');
  }));

  it('CEP inexistente e API fora do ar: avisa e deixa preencher manualmente', fakeAsync(() => {
    const { f, el, type } = render();
    type('99999999');
    http.expectOne('/api/address/cep/99999999').flush({}, { status: 404, statusText: 'x' });
    f.detectChanges();
    expect(el.querySelector('.cep-input')!.getAttribute('data-state')).toBe('not-found');
    expect(el.querySelector('.msg')!.textContent).toContain('CEP não encontrado');

    type('2004002');
    expect(el.querySelector('.msg')!.textContent!.trim()).toBe('');
    type('20040020');
    http.expectOne('/api/address/cep/20040020').flush({}, { status: 503, statusText: 'x' });
    f.detectChanges();
    expect(el.querySelector('.cep-input')!.getAttribute('data-state')).toBe('error');
    expect(el.querySelector('.msg')!.textContent).toContain('Preencha o endereço manualmente');
    expect(el.querySelector<HTMLInputElement>('.street input')!.disabled).toBeFalse();
  }));

  it('campos editaveis e "sem numero"', fakeAsync(() => {
    const { f, el, host } = render();
    const set = (sel: string, v: string) => {
      const i = el.querySelector<HTMLInputElement | HTMLSelectElement>(sel)!;
      i.value = v;
      i.dispatchEvent(new Event(i.tagName === 'SELECT' ? 'change' : 'input'));
    };
    set('.street input', 'Rua Nova');
    set('.number input', '42');
    set('.district input', 'Centro');
    set('.city input', 'Campinas');
    set('.uf select', 'SP');
    set('.reference input', 'Portão azul');
    set('.complement input', 'Casa 2');
    expect(host.address()).toEqual(jasmine.objectContaining({ street: 'Rua Nova', number: '42', district: 'Centro', city: 'Campinas', state: 'SP', reference: 'Portão azul', complement: 'Casa 2' }));

    const noNumber = el.querySelector<HTMLInputElement>('.no-number input')!;
    noNumber.checked = true;
    noNumber.dispatchEvent(new Event('change'));
    f.detectChanges();
    expect(host.address().number).toBe('S/N');
    expect(el.querySelector<HTMLInputElement>('.number input')!.disabled).toBeTrue();
    noNumber.checked = false;
    noNumber.dispatchEvent(new Event('change'));
    f.detectChanges();
    tick(1);
    expect(host.address().number).toBe('');
  }));

  it('AddressApi: 404 vira "CEP nao encontrado" com status', () => {
    let err: (Error & { status?: number }) | undefined;
    TestBed.inject(AddressApi).lookup('01001-000').subscribe({ error: (e) => (err = e) });
    http.expectOne('/api/address/cep/01001000').flush({}, { status: 404, statusText: 'x' });
    expect(err?.message).toBe('CEP não encontrado');
    expect(err?.status).toBe(404);
  });
});
