import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, retry, throwError, timer } from 'rxjs';

import { toUserMessage } from '../pets/pets.service';
import { Facets, Filters, ProductPage, Quote, QuoteRequest } from './catalog.models';

export const CATALOG_API = '/api/catalog';

/** Converte os filtros da tela nos parametros da API (so envia o que esta preenchido). */
export function toParams(f: Filters, page: number, pageSize: number): HttpParams {
  let p = new HttpParams().set('page', page).set('pageSize', pageSize).set('sort', f.sort);
  const q = f.q.trim();
  if (q) p = p.set('q', q.slice(0, 60));
  if (f.species) p = p.set('species', f.species);
  f.stage.forEach((v) => (p = p.append('stage', v)));
  f.petSize.forEach((v) => (p = p.append('petSize', v)));
  f.line.forEach((v) => (p = p.append('line', v)));
  f.brand.forEach((v) => (p = p.append('brand', v)));
  if (f.minPrice != null) p = p.set('minPrice', f.minPrice);
  if (f.maxPrice != null) p = p.set('maxPrice', f.maxPrice);
  if (f.promo) p = p.set('promo', true);
  return p;
}

const friendly = (err: HttpErrorResponse) => throwError(() => new Error(toUserMessage(err)));

/** Leituras repetem em falha transitoria (rede/503) com backoff; 429 nunca e repetido. */
function transientRetry<T>() {
  return retry<T>({
    count: 2,
    delay: (err: HttpErrorResponse, attempt: number) =>
      err.status === 0 || err.status === 503 ? timer(attempt * 400) : throwError(() => err),
  });
}

@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);

  search(filters: Filters, page = 0, pageSize = 12): Observable<ProductPage> {
    return this.http
      .get<ProductPage>(`${CATALOG_API}/products`, { params: toParams(filters, page, pageSize) })
      .pipe(transientRetry(), catchError(friendly));
  }

  facets(): Observable<Facets> {
    return this.http.get<Facets>(`${CATALOG_API}/facets`).pipe(transientRetry(), catchError(friendly));
  }

  quote(request: QuoteRequest): Observable<Quote> {
    return this.http.post<Quote>(`${CATALOG_API}/cart/quote`, request).pipe(catchError(friendly));
  }
}
