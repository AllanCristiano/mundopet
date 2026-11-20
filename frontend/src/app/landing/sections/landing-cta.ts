import { Component, computed, inject } from '@angular/core';

import { SiteConfigService } from '../../core/site-config';
import { RevealDirective } from '../motion/reveal.directive';
import { PetArt } from '../pet-art';
import { makeParticles } from './landing-hero';

@Component({
  selector: 'app-landing-cta',
  imports: [RevealDirective, PetArt],
  template: `
    <section class="cta" aria-labelledby="cta-title">
      <div class="bokeh" aria-hidden="true">
        @for (p of petals; track $index) {
          <i
            [style.left.%]="p.x"
            [style.width.px]="p.size * 6"
            [style.height.px]="p.size * 6"
            [style.animation-delay.s]="p.delay"
            [style.animation-duration.s]="p.duration + 4"
          ></i>
        }
      </div>

      <div class="inner container">
        <div class="cat" appReveal><app-pet-art kind="cat" /></div>
        <p class="kicker" appReveal>{{ cta().kicker }}</p>
        <h2 id="cta-title" [appReveal]="120">{{ cta().title }} <em>{{ cta().highlight }}</em></h2>
        <p class="sub" [appReveal]="220">{{ cta().text }}</p>
        <div class="actions" [appReveal]="320">
          <a class="btn btn--gold" [href]="whatsapp()" target="_blank" rel="noopener">Agendar visita</a>
          <a class="btn" href="#topo">Voltar ao topo</a>
        </div>
      </div>
    </section>
  `,
  styles: `
    .cta { position: relative; overflow: hidden; padding: 120px 0 140px; text-align: center;
      background: radial-gradient(ellipse at 50% 100%, rgba(227,176,98,.22), transparent 60%), var(--bg); }
    .bokeh i { position: absolute; bottom: -60px; border-radius: 50%;
      background: radial-gradient(circle, rgba(247,215,159,.9), rgba(227,176,98,.25) 55%, transparent 70%);
      filter: blur(1px); opacity: 0; animation: drift linear infinite; }
    .inner { position: relative; }
    .cat { width: 120px; height: 120px; margin: 0 auto 24px; --stroke: 2.6;
      filter: drop-shadow(0 0 16px rgba(227,176,98,.5)); }
    h2 { font-size: clamp(2.6rem, 13vw, 6.5rem); font-style: italic; margin: 14px 0 20px; }
    .sub { color: var(--muted); max-width: 44ch; margin: 0 auto 32px; }
    .actions { display: flex; flex-direction: column; gap: 12px; align-items: stretch; max-width: 320px; margin: 0 auto; }
    @media (min-width: 900px) {
      .cta { padding: 180px 0; }
      .actions { flex-direction: row; justify-content: center; max-width: none; }
    }
    @keyframes drift {
      0% { opacity: 0; transform: translate(0, 0) scale(.6); }
      15% { opacity: .9; }
      100% { opacity: 0; transform: translate(40px, -110vh) scale(1.1); }
    }
  `,
})
export class LandingCta {
  private readonly site = inject(SiteConfigService);
  readonly whatsapp = this.site.whatsappUrl;
  readonly cta = computed(() => this.site.settings().cta);
  readonly petals = makeParticles(18, 42);
}
