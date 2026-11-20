import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

import { beautyError } from '../beauty/beauty.api';

/** Token da sessao so na aba (fechou a aba = saiu). Nunca vai para o localStorage. */
export const ADMIN_TOKEN_KEY = 'mundopet-admin-token';
export const ADMIN_USER_KEY = 'mundopet-admin-user';
export const ADMIN_HEADER = 'X-Admin-Token';
export const ADMIN_API = '/api/admin';

export interface AdminMode {
  enabled: boolean;
  demo: boolean;
}

interface LoginResponse {
  token: string;
  username: string;
  demo: boolean;
  expiresInSeconds: number;
}

function read(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* armazenamento bloqueado: segue so em memoria */
  }
}

/** Login (usuario e senha) da area do dono e da clinica: uma sessao vale para a gestao e o Espaco Beleza. */
@Injectable({ providedIn: 'root' })
export class AdminSession {
  private readonly http = inject(HttpClient);

  readonly token = signal(read(ADMIN_TOKEN_KEY));
  readonly username = signal(read(ADMIN_USER_KEY));
  /** Mensagem mostrada na tela de entrada (ex.: sessao expirou). */
  readonly notice = signal<string | null>(null);

  headers(): { headers: HttpHeaders } {
    return { headers: new HttpHeaders({ [ADMIN_HEADER]: this.token() }) };
  }

  /** Se a API estiver fora, assume o modo normal (pede login e senha). */
  mode(): Observable<AdminMode> {
    return this.http.get<AdminMode>(`${ADMIN_API}/mode`).pipe(catchError(() => of({ enabled: true, demo: false })));
  }

  login(username: string, password: string): Observable<void> {
    return this.http.post<LoginResponse>(`${ADMIN_API}/login`, { username: username.trim(), password }).pipe(
      tap((r) => {
        this.token.set(r.token);
        this.username.set(r.username);
        this.notice.set(null);
        write(ADMIN_TOKEN_KEY, r.token);
        write(ADMIN_USER_KEY, r.username);
      }),
      map(() => undefined),
      catchError((err: HttpErrorResponse) => throwError(() => beautyError(err))),
    );
  }

  /** Sai: avisa o servidor (encerra a sessao) e limpa a aba. */
  logout(notice: string | null = null): void {
    const token = this.token();
    if (token && !notice) {
      this.http.delete(`${ADMIN_API}/session`, { headers: new HttpHeaders({ [ADMIN_HEADER]: token }) }).subscribe({ error: () => undefined });
    }
    this.token.set('');
    this.username.set('');
    this.notice.set(notice);
    write(ADMIN_TOKEN_KEY, null);
    write(ADMIN_USER_KEY, null);
  }
}
