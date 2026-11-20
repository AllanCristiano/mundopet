import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { BeautyApi } from '../../beauty/beauty.api';
import { BeautyPhoto, SERVICE_LABELS, Testimonial, authorLine, rating, stars } from '../../beauty/beauty.models';
import { PetArt } from '../pet-art';
import { RevealDirective } from '../motion/reveal.directive';

/**
 * Vitrine do Espaco Beleza na landing: ultimas fotos em "polaroids" + depoimentos aprovados.
 * Se a API falhar ou ainda nao houver conteudo, mostra um convite (a landing nunca quebra).
 */
@Component({
  selector: 'app-landing-beauty',
  imports: [RouterLink, RevealDirective, PetArt],
  template: `
    <section id="espaco-beleza" class="spa" aria-labelledby="spa-title">
      <div class="container head">
        <p class="kicker" appReveal>Espaço Beleza</p>
        <h2 id="spa-title" [appReveal]="100">Recém-saídos <em>do spa</em></h2>
        @if (count() > 0) {
          <p class="score" [appReveal]="180">
            <span class="st" aria-hidden="true">{{ stars(average()) }}</span>
            <strong>{{ rating(average()) }}</strong> · {{ count() }} {{ count() === 1 ? 'depoimento' : 'depoimentos' }}
          </p>
        }
      </div>

      @if (photos().length) {
        <div class="strip" aria-label="Últimas fotos do Espaço Beleza">
          <ul class="track" [style.--n]="photos().length" [class.moving]="photos().length >= 4">
            @for (p of loop(); track $index; let i = $index) {
              <li [style.--r]="tilt(i)" [attr.aria-hidden]="i >= photos().length ? 'true' : null">
                <a routerLink="/beleza" [attr.tabindex]="i >= photos().length ? -1 : null">
                  <img [src]="p.thumbUrl" [alt]="'Foto de ' + p.petName" loading="lazy" decoding="async" />
                  <span><strong>{{ p.petName }}</strong> · {{ labels[p.service] }}</span>
                </a>
              </li>
            }
          </ul>
        </div>
      } @else if (loaded()) {
        <div class="container soon" appReveal>
          <app-pet-art class="art" kind="scissors" />
          <p>Em breve, as fotos dos nossos clientes mais cheirosos.</p>
        </div>
      }

      <div class="container foot">
        @if (quotes().length) {
          <ul class="quotes">
            @for (t of quotes(); track t.id; let i = $index) {
              <li [appReveal]="i * 120">
                <blockquote>“{{ t.message }}”</blockquote>
                <cite>{{ authorLine(t) }}</cite>
              </li>
            }
          </ul>
        }
        <a class="btn btn--gold" routerLink="/beleza" [appReveal]="200">Ver galeria e depoimentos <span aria-hidden="true">→</span></a>
      </div>
    </section>
  `,
  styles: `
    .spa { padding: 100px 0; overflow: hidden;
      background: radial-gradient(90% 60% at 10% 0%, color-mix(in srgb, var(--beauty) 16%, transparent), transparent 60%), var(--bg); }
    h2 { font-size: clamp(2.1rem, 9vw, 4rem); margin: 12px 0 14px; }
    h2 em { color: var(--beauty); }
    .score { margin: 0; color: var(--muted); font-size: .9rem; }
    .score strong { color: var(--ink); }
    .st { color: var(--gold); letter-spacing: .1em; margin-right: 6px; }
    .strip { margin-top: 40px; padding: 18px 0 28px;
      mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
    .track { display: flex; gap: 18px; width: max-content; margin: 0; padding: 0 var(--gutter); list-style: none; }
    .track.moving { animation: slide calc(var(--n) * 5s) linear infinite; }
    .strip:hover .track, .strip:focus-within .track { animation-play-state: paused; }
    li { flex: none; width: 190px; transform: rotate(var(--r)); transition: transform .5s var(--ease-out); }
    li:hover { transform: rotate(0) scale(1.05); }
    li a { display: block; padding: 10px 10px 12px; border-radius: 6px; background: #fbf7f0; color: #2a2119;
      text-decoration: none; box-shadow: 0 18px 40px -18px rgba(0,0,0,.55); }
    li img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 3px; background: #e8dcc8; }
    li span { display: block; padding-top: 8px; font-size: .78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    li strong { font-family: var(--font-display); font-size: 1rem; font-weight: 500; }
    .soon { display: grid; justify-items: center; gap: 8px; margin-top: 32px; text-align: center; color: var(--muted); }
    .soon .art { width: 120px; height: 120px; color: var(--beauty); }
    .foot { display: grid; gap: 28px; margin-top: 32px; }
    .quotes { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
    .quotes li { width: auto; transform: none; padding: 22px; border: 1px solid var(--line); border-radius: 20px; background: var(--bg-2); }
    blockquote { margin: 0 0 12px; font-family: var(--font-display); font-style: italic; font-size: 1.15rem; line-height: 1.4;
      display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
    cite { font-style: normal; font-size: .8rem; color: var(--gold); letter-spacing: .06em; }
    .foot .btn { justify-self: stretch; }
    @media (min-width: 640px) {
      li { width: 230px; }
      .quotes { grid-template-columns: 1fr 1fr; }
      .foot .btn { justify-self: start; }
    }
    @media (min-width: 900px) { .spa { padding: 140px 0; } }
    @keyframes slide { to { transform: translateX(calc(-50% - 9px)); } }
    @media (prefers-reduced-motion: reduce) {
      .track.moving { animation: none; }
      .strip { overflow-x: auto; mask-image: none; }
      li, li:hover { transform: none; }
    }
  `,
})
export class LandingBeauty {
  private readonly api = inject(BeautyApi);

  readonly labels = SERVICE_LABELS;
  readonly stars = stars;
  readonly rating = rating;
  readonly authorLine = authorLine;

  readonly photos = signal<BeautyPhoto[]>([]);
  readonly quotes = signal<Testimonial[]>([]);
  readonly average = signal(0);
  readonly count = signal(0);
  readonly loaded = signal(false);

  /** Duplicado para o carrossel sem emenda (so quando ele se move). */
  readonly loop = computed(() => (this.photos().length >= 4 ? [...this.photos(), ...this.photos()] : this.photos()));

  constructor() {
    forkJoin({
      photos: this.api.photos(null, 0, 10).pipe(catchError(() => of(null))),
      testimonials: this.api.testimonials(0, 2).pipe(catchError(() => of(null))),
    }).subscribe(({ photos, testimonials }) => {
      this.photos.set(photos?.items ?? []);
      this.quotes.set(testimonials?.items ?? []);
      this.average.set(testimonials?.summary.average ?? 0);
      this.count.set(testimonials?.summary.count ?? 0);
      this.loaded.set(true);
    });
  }

  /** Inclinacao alternada das polaroids (-4deg .. 4deg). */
  tilt(i: number): string {
    return `${[-3, 2.5, -1.5, 4, -4, 1.5][i % 6]}deg`;
  }
}
