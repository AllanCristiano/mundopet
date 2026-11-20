import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { toUserMessage } from '../pets/pets.service';

export interface DeliveryAddress {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  reference: string;
}

export const EMPTY_ADDRESS: DeliveryAddress = {
  cep: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
  reference: '',
};

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const ADDRESS_STORAGE_KEY = 'mundopet-address';

export interface CepResult {
  cep: string;
  street: string;
  district: string;
  city: string;
  state: string;
  source: string;
}

export const cepDigits = (raw: string) => raw.replace(/\D/g, '').slice(0, 8);

/** Mascara enquanto digita: 01001000 -> 01001-000 */
export function maskCep(raw: string): string {
  const d = cepDigits(raw);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function isAddressValid(a: DeliveryAddress): boolean {
  return (
    cepDigits(a.cep).length === 8 &&
    a.street.trim().length > 0 &&
    a.number.trim().length > 0 &&
    a.district.trim().length > 0 &&
    a.city.trim().length > 0 &&
    UFS.includes(a.state.trim().toUpperCase())
  );
}

/** Formato aceito pelo backend (campos opcionais vazios viram null). */
export function toApiAddress(a: DeliveryAddress) {
  return {
    cep: maskCep(a.cep),
    street: a.street.trim(),
    number: a.number.trim(),
    complement: a.complement.trim() || null,
    district: a.district.trim(),
    city: a.city.trim(),
    state: a.state.trim().toUpperCase(),
    reference: a.reference.trim() || null,
  };
}

export function loadAddress(): DeliveryAddress {
  try {
    const raw = localStorage.getItem(ADDRESS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_ADDRESS };
    const out = { ...EMPTY_ADDRESS };
    for (const k of Object.keys(EMPTY_ADDRESS) as (keyof DeliveryAddress)[]) {
      if (typeof parsed[k] === 'string') out[k] = parsed[k].slice(0, 120);
    }
    return out;
  } catch {
    return { ...EMPTY_ADDRESS };
  }
}

export function saveAddress(a: DeliveryAddress): void {
  try {
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(a));
  } catch {
    // armazenamento indisponivel: endereco vale so nesta visita
  }
}

@Injectable({ providedIn: 'root' })
export class AddressApi {
  private readonly http = inject(HttpClient);

  /** 404 => "CEP nao encontrado"; outros erros => mensagem amigavel. */
  lookup(cep: string): Observable<CepResult> {
    return this.http.get<CepResult>(`/api/address/cep/${cepDigits(cep)}`).pipe(
      catchError((err: HttpErrorResponse) =>
        throwError(() => Object.assign(new Error(err.status === 404 ? 'CEP não encontrado' : toUserMessage(err)), { status: err.status })),
      ),
    );
  }
}
