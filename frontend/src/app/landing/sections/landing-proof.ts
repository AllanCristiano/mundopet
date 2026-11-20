import { Component } from '@angular/core';

import { STATS, TESTIMONIALS } from '../landing.data';
import { CountUpDirective } from '../motion/count-up.directive';
import { RevealDirective } from '../motion/reveal.directive';

@Component({
  selector: 'app-landing-proof',
  imports: [CountUpDirective, RevealDirective],
  template: `
    <section class="proof" aria-labelledby="proof-title">
      <div class="container">
        <p class="kicker" appReveal>Quem conhece, volta</p>
        <h2 id="proof-title" [appReveal]="100">Números que <em>abanam o rabo</em></h2>

        <dl class="stats">
          @for (s of stats; track s.label; let i = $index) {
            <div class="stat" [appReveal]="i * 120">
              <dt>{{ s.label }}</dt>
              <dd
                [appCountUp]="s.value"
                [decimals]="s.decimals"
                [prefix]="s.prefix"
                [suffix]="s.suffix"
              ></dd>
            </div>
          }
        </dl>
      </div>

      <div class="reviews" aria-label="Depoimentos">
        <ul class="track">
          @for (t of loop; track $index; let i = $index) {
            <li [attr.aria-hidden]="i >= testimonials.length ? 'true' : null">
              <blockquote>“{{ t.quote }}”</blockquote>
              <cite>{{ t.author }}</cite>
            </li>
          }
        </ul>
      </div>
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
    .track { display: flex; gap: 16px; width: max-content; list-style: none; margin: 0; padding: 0;
      animation: slide 40s linear infinite; }
    .reviews:hover .track, .reviews:active .track { animation-play-state: paused; }
    li { width: min(80vw, 380px); padding: 26px; border: 1px solid var(--line); border-radius: 20px;
      background: linear-gradient(160deg, rgba(227,176,98,.08), transparent 60%), var(--bg); }
    blockquote { margin: 0 0 16px; font-family: var(--font-display); font-style: italic; font-size: 1.2rem; line-height: 1.4; }
    cite { font-style: normal; font-size: .8rem; color: var(--gold); letter-spacing: .08em; }
    @media (min-width: 900px) {
      .proof { padding: 140px 0; }
      .stats { grid-template-columns: repeat(4, 1fr); gap: 40px; }
    }
    @keyframes slide { to { transform: translateX(calc(-50% - 8px)); } }
  `,
})
export class LandingProof {
  readonly stats = STATS;
  readonly testimonials = TESTIMONIALS;
  /** Duplicado para o carrossel infinito sem emenda (a copia fica oculta para leitores de tela). */
  readonly loop = [...TESTIMONIALS, ...TESTIMONIALS];
}
