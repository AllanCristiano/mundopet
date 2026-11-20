import { Component, computed, inject, output, signal } from '@angular/core';

import { BeautyApi } from './beauty.api';
import { MESSAGE_MAX, MESSAGE_MIN, NewTestimonial } from './beauty.models';

/** "Conte como foi": depoimento do cliente. Entra pendente e a clinica aprova. */
@Component({
  selector: 'app-testimonial-form',
  template: `
    @if (done()) {
      <div class="done" role="status">
        <span class="paw" aria-hidden="true">🐾</span>
        <p><strong>Obrigado!</strong></p>
        <p class="muted">{{ done() }}</p>
        <button type="button" class="btn" (click)="reset()">Enviar outro</button>
      </div>
    } @else {
      <form (submit)="send($event)" novalidate>
        <div class="row">
          <label>
            <span>Seu nome</span>
            <input type="text" name="author" maxlength="60" autocomplete="given-name" required
              [value]="author()" (input)="author.set(val($event))" />
          </label>
          <label>
            <span>Nome do pet <small>(opcional)</small></span>
            <input type="text" name="petName" maxlength="40" [value]="petName()" (input)="petName.set(val($event))" />
          </label>
        </div>

        <fieldset class="stars" [attr.data-rating]="rating()">
          <legend>Sua nota</legend>
          @for (n of [1, 2, 3, 4, 5]; track n) {
            <label [class.on]="n <= rating()">
              <input type="radio" name="rating" [value]="n" [checked]="rating() === n" (change)="rating.set(n)" />
              <span aria-hidden="true">★</span>
              <span class="sr">{{ n }} {{ n === 1 ? 'estrela' : 'estrelas' }}</span>
            </label>
          }
        </fieldset>

        <label>
          <span>Como foi a experiência?</span>
          <textarea name="message" rows="4" [attr.maxlength]="max" required
            placeholder="Ex.: O Thor voltou cheiroso e superfeliz, a tosa ficou linda!"
            [value]="message()" (input)="message.set(val($event))"></textarea>
          <small class="count" [class.ok]="messageOk()">{{ message().trim().length }}/{{ max }}</small>
        </label>

        <!-- campo-isca: invisivel para pessoas; robos preenchem -->
        <label class="hp" aria-hidden="true">
          Site <input type="text" name="website" tabindex="-1" autocomplete="off" [value]="website()" (input)="website.set(val($event))" />
        </label>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" class="btn btn--gold" [disabled]="!valid() || sending()">
          {{ sending() ? 'Enviando…' : 'Enviar depoimento' }}
        </button>
        <p class="note">Seu depoimento aparece no site depois que a equipe aprovar. Não publicamos telefone nem e-mail.</p>
      </form>
    }
  `,
  styleUrl: './testimonial-form.scss',
})
export class TestimonialForm {
  private readonly api = inject(BeautyApi);
  readonly sent = output<void>();

  readonly max = MESSAGE_MAX;
  readonly author = signal('');
  readonly petName = signal('');
  readonly rating = signal(5);
  readonly message = signal('');
  readonly website = signal('');
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly done = signal<string | null>(null);

  readonly messageOk = computed(() => this.message().trim().length >= MESSAGE_MIN);
  readonly valid = computed(() => this.author().trim().length > 0 && this.messageOk() && this.rating() >= 1);

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  send(e: Event): void {
    e.preventDefault();
    if (!this.valid() || this.sending()) return;
    const body: NewTestimonial = {
      author: this.author().trim(),
      petName: this.petName().trim() || null,
      rating: this.rating(),
      message: this.message().trim(),
      website: this.website(),
    };
    this.sending.set(true);
    this.error.set(null);
    this.api.submit(body).subscribe({
      next: (msg) => {
        this.sending.set(false);
        this.done.set(msg);
        this.sent.emit();
      },
      error: (err: Error) => {
        this.sending.set(false);
        this.error.set(err.message);
      },
    });
  }

  reset(): void {
    this.message.set('');
    this.rating.set(5);
    this.done.set(null);
  }
}
