import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { BeautyApi } from '../../beauty/beauty.api';
import { Testimonial, authorLine, stars } from '../../beauty/beauty.models';
import { SiteConfigService } from '../../core/site-config';
import { CountUpDirective } from '../motion/count-up.directive';
import { RevealDirective } from '../motion/reveal.directive';

/** Quantos depoimentos aprovados entram no carrossel. */
export const PROOF_TESTIMONIALS = 10;

/**
 * Numeros (editaveis na gestao) + depoimentos REAIS aprovados pela clinica.
 * Numero com fonte "RATING" mostra a nota media real (quando ja existe depoimento aprovado).
 * Sem depoimentos ainda: em vez de carrossel, um convite para avaliar.
 */
@Component({
  selector: 'app-landing-proof',
  imports: [CountUpDirective, RevealDirective, RouterLink],
  template: `
    <section class="proof" aria-labelledby="proof-title">
      <div class="container">
        <p class="kicker" appReveal>Quem conhece, volta</p>
        <h2 id="proof-title" [appReveal]="100">Números que <em>abanam o rabo</em></h2>

        <dl class="stats" [style.--n]="stats().length">
          @for (s of stats(); track $index; let i = $index) {
            <div class="stat" [appReveal]="i * 120">
              <dt>{{ s.label }}</dt>
              <!-- a chave forca recriar o contador quando o valor real chega -->
              @for (v of [s.value]; track v) {
                <dd [appCountUp]="v" [decimals]="s.decimals" [prefix]="s.prefix" [suffix]="s.suffix"></dd>
              }
            </div>
          }
        </dl>
      </div>

      @if (testimonials().length) {
        <div class="reviews" aria-label="Depoimentos de clientes">
          <ul class="track" [class.moving]="testimonials().length >= 3">
            @for (t of loop(); track $index; let i = $index) {
              <li [attr.aria-hidden]="i >= testimonials().length ? 'true' : null">
                <span class="st" [attr.aria-label]="t.rating + ' de 5 estrelas'">{{ stars(t.rating) }}</span>
                <blockquote>“{{ t.message }}”</blockquote>
                <cite>{{ authorLine(t) }}</cite>
              </li>
            }
          </ul>
        </div>
        <div class="container more">
          <a routerLink="/beleza" fragment="depoimentos">Ver todos os depoimentos →</a>
        </div>
      } @else if (loaded()) {
        <div class="container invite" appReveal>
          <p>Já trouxe seu pet aqui? Conte como foi e ajude outros tutores a nos conhecer.</p>
          <a class="btn" routerLink="/beleza" fragment="depoimentos">Deixar um depoimento</a>
        </div>
      }
    </section>
  `,
  styles: `
    .proof { padding: 100px 0; background: var(--bg-2); overflow: hidden; }
    h2 { font-size: clamp(2.1rem, 9vw, 4rem); margin: 12px 0 48px; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 16px; margin: 0 0 72px; }
    .stat { display: flex; flex-direction: column-reverse; gap: 4px; border-top: 1px solid var(--line); padding-top: 16px; }
    dd { margin: 0; font-family: var(--font-display); font-size: clamp(2.2rem, 10vw, 4rem); color: var(--gold-2); line-height: 1; }
    dt { color: var(--muted); font-size: .85rem; }
    .reviews { mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
    .track { display: flex; gap: 16px; width: max-content; list-style: none; margin: 0; padding: 0 var(--gutter); }
    .track.moving { animation: slide 40s linear infinite; }
    .reviews:hover .track, .reviews:active .track, .reviews:focus-within .track { animation-play-state: paused; }
    li { display: grid; gap: 12px; align-content: start; width: min(80vw, 380px); padding: 26px;
      border: 1px solid var(--line); border-radius: 20px;
      background: linear-gradient(160deg, rgba(227,176,98,.08), transparent 60%), var(--bg); }
    .st { color: var(--gold); letter-spacing: .12em; }
    blockquote { margin: 0; font-family: var(--font-display); font-style: italic; font-size: 1.2rem; line-height: 1.4;
      display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
    cite { font-style: normal; font-size: .8rem; color: var(--gold); letter-spacing: .08em; }
    .more { margin-top: 24px; }
    .more a { color: var(--gold); font-weight: 600; text-decoration: none; }
    .invite { display: grid; gap: 16px; justify-items: start; }
    .invite p { margin: 0; max-width: 46ch; color: var(--muted); }
    @media (min-width: 900px) {
      .proof { padding: 140px 0; }
      .stats { grid-template-columns: repeat(var(--n), 1fr); gap: 40px; }
    }
    @keyframes slide { to { transform: translateX(calc(-50% - 8px)); } }
    @media (prefers-reduced-motion: reduce) {
      .track.moving { animation: none; }
      .reviews { overflow-x: auto; mask-image: none; }
    }
  `,
})
export class LandingProof {
  private readonly site = inject(SiteConfigService);
  private readonly api = inject(BeautyApi);

  readonly stars = stars;
  readonly authorLine = authorLine;

  readonly testimonials = signal<Testimonial[]>([]);
  readonly average = signal<number | null>(null);
  readonly loaded = signal(false);

  /** Numeros da gestao; "nota media" usa a nota real quando ja ha depoimentos aprovados. */
  readonly stats = computed(() =>
    this.site.settings().stats.map((s) => {
      const real = this.average();
      return s.source === 'RATING' && real != null ? { ...s, value: real, decimals: 1 } : s;
    }),
  );

  /** Duplicado para o carrossel sem emenda (a copia fica oculta para leitores de tela). */
  readonly loop = computed(() =>
    this.testimonials().length >= 3 ? [...this.testimonials(), ...this.testimonials()] : this.testimonials(),
  );

  constructor() {
    this.api
      .testimonials(0, PROOF_TESTIMONIALS)
      .pipe(catchError(() => of(null)))
      .subscribe((page) => {
        this.testimonials.set(page?.items ?? []);
        this.average.set(page && page.summary.count > 0 ? page.summary.average : null);
        this.loaded.set(true);
      });
  }
}
