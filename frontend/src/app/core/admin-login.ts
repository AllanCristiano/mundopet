import { Component, inject, input, output, signal } from '@angular/core';

import { AdminMode, AdminSession } from './admin-session';

/** Tela de entrada (login e senha) da gestao do site e da area da clinica. */
@Component({
  selector: 'app-admin-login',
  template: `
    <form class="login" (submit)="submit($event)" novalidate>
      <span class="lock" aria-hidden="true">🔐</span>
      <h1>{{ title() }} <em>{{ highlight() }}</em></h1>
      <p class="muted">{{ subtitle() }}</p>

      @if (mode()?.demo) {
        <p class="demo" role="note">
          <strong>Modo demonstração</strong>
          Deixe login e senha em branco e clique em Entrar.
        </p>
      }
      @if (mode() && !mode()!.enabled) {
        <p class="error" role="alert">Área administrativa desligada: configure <code>ADMIN_PASSWORD</code> no servidor.</p>
      }

      <label>
        <span>Login</span>
        <input type="text" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="60"
          [value]="username()" (input)="username.set(val($event))" />
      </label>
      <label>
        <span>Senha</span>
        <span class="pass">
          <input [type]="show() ? 'text' : 'password'" name="password" autocomplete="current-password" maxlength="200"
            [value]="password()" (input)="password.set(val($event))" />
          <button type="button" class="eye" (click)="show.set(!show())" [attr.aria-label]="show() ? 'Esconder senha' : 'Mostrar senha'"
            [attr.aria-pressed]="show()">{{ show() ? '🙈' : '👁' }}</button>
        </span>
      </label>

      @if (session.notice()) {
        <p class="error" role="alert">{{ session.notice() }}</p>
      }
      <button type="submit" class="btn btn--gold" [disabled]="busy() || !canSubmit()">
        {{ busy() ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>
  `,
  styles: `
    :host { display: block; }
    .login { display: grid; gap: 16px; max-width: 440px; margin: 40px auto; padding: 24px; text-align: center;
      border: 1px solid var(--line); border-radius: 22px; background: var(--bg-2); }
    h1 { font-size: 2.2rem; }
    p { margin: 0; }
    .muted { color: var(--muted); }
    .lock { font-size: 2.6rem; }
    label { display: grid; gap: 6px; text-align: left; font-size: .85rem; }
    input { width: 100%; min-height: 48px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px;
      background: var(--bg); color: var(--ink); font: inherit; }
    input:focus { border-color: var(--gold); outline: none; }
    .pass { position: relative; display: block; }
    .pass input { padding-right: 52px; }
    .eye { position: absolute; top: 4px; right: 4px; width: 40px; height: 40px; border: 0; border-radius: 10px;
      background: none; color: inherit; font-size: 1.1rem; cursor: pointer; }
    .demo { display: grid; gap: 2px; padding: 12px 14px; border: 1px dashed var(--gold); border-radius: 14px;
      background: color-mix(in srgb, var(--gold) 12%, transparent); font-size: .85rem; text-align: left; }
    .demo strong { color: var(--gold); letter-spacing: .08em; text-transform: uppercase; font-size: .72rem; }
    .error { color: #ff8a80; font-size: .85rem; }
    :host-context([data-theme='light']) .error { color: #b3261e; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
  `,
})
export class AdminLogin {
  readonly session = inject(AdminSession);

  readonly title = input('Área da');
  readonly highlight = input('clínica');
  readonly subtitle = input('Entre com seu login e senha.');
  readonly done = output<void>();

  readonly username = signal('');
  readonly password = signal('');
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly mode = signal<AdminMode | null>(null);

  constructor() {
    this.session.mode().subscribe((m) => this.mode.set(m));
  }

  /** Fora do modo demonstracao, login e senha sao obrigatorios. */
  canSubmit(): boolean {
    return !!this.mode()?.demo || (this.username().trim().length > 0 && this.password().length > 0);
  }

  submit(e: Event): void {
    e.preventDefault();
    if (this.busy() || !this.canSubmit()) return;
    this.busy.set(true);
    this.session.login(this.username(), this.password()).subscribe({
      next: () => {
        this.busy.set(false);
        this.password.set('');
        this.done.emit();
      },
      error: (err: Error) => {
        this.busy.set(false);
        this.password.set('');
        this.session.notice.set(err.message);
      },
    });
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
