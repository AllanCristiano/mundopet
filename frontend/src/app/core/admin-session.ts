import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, tap, throwError } from 'rxjs';

import { beautyError } from '../beauty/beauty.api';

/** Token so na sessao da aba (fechou a aba = saiu). Nunca vai para o localStorage. */
export const ADMIN_TOKEN_KEY = 'mundopet-admin-token';
export const ADMIN_HEADER = 'X-Admin-Token';

function read(): string {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function write(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* armazenamento bloqueado: segue so em memoria */
  }
}

/** Login da area do dono/clinica: um token so para a gestao e o Espaco Beleza. */
@Injectable({ providedIn: 'root' })
export class AdminSession {
  private readonly http = inject(HttpClient);

  readonly token = signal(read());
  /** Mensagem mostrada na tela de entrada (ex.: token expirou). */
  readonly notice = signal<string | null>(null);

  headers(): { headers: HttpHeaders } {
    return { headers: new HttpHeaders({ [ADMIN_HEADER]: this.token() }) };
  }

  login(token: string): Observable<void> {
    return this.http.get<void>('/api/site/admin/check', { headers: new HttpHeaders({ [ADMIN_HEADER]: token }) }).pipe(
      tap(() => {
        this.token.set(token);
        this.notice.set(null);
        write(token);
      }),
      catchError((err: HttpErrorResponse) => throwError(() => beautyError(err))),
    );
  }

  logout(notice: string | null = null): void {
    this.token.set('');
    this.notice.set(notice);
    write(null);
  }
}
