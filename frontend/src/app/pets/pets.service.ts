import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, retry, throwError, timer } from 'rxjs';

import { CreatePet, Pet } from './pet.model';

export const API_URL = '/api/pets';

/** Converte erros HTTP em mensagens amigaveis. */
export function toUserMessage(err: HttpErrorResponse): string {
  switch (err.status) {
    case 0:
      return 'Sem conexao com o servidor.';
    case 400:
      return 'Dados invalidos.';
    case 404:
      return 'Pet nao encontrado.';
    case 413:
      return 'Arquivo muito grande.';
    case 429:
      return 'Muitas requisicoes. Aguarde um instante.';
    case 503:
      return 'Servico temporariamente indisponivel.';
    default:
      return 'Erro inesperado.';
  }
}

@Injectable({ providedIn: 'root' })
export class PetsService {
  private readonly http = inject(HttpClient);

  list(page = 0, size = 20): Observable<Pet[]> {
    return this.http.get<Pet[]>(API_URL, { params: { page, size } }).pipe(
      // Leitura e idempotente: tenta de novo em falhas transitorias (rede / 503), com backoff
      retry({
        count: 2,
        delay: (err: HttpErrorResponse, attempt) =>
          err.status === 0 || err.status === 503 ? timer(attempt * 300) : throwError(() => err),
      }),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(toUserMessage(err)))),
    );
  }

  create(pet: CreatePet): Observable<Pet> {
    return this.http
      .post<Pet>(API_URL, pet)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(toUserMessage(err)))));
  }

  uploadPhoto(id: string, file: File): Observable<Pet> {
    const body = new FormData();
    body.append('file', file);
    return this.http
      .put<Pet>(`${API_URL}/${id}/photo`, body)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(toUserMessage(err)))));
  }

  photoUrl(id: string): string {
    return `${API_URL}/${id}/photo`;
  }
}
