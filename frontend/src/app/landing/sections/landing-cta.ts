import { Component } from '@angular/core';

import { NAV_LINKS, WHATSAPP_URL } from '../landing.data';
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
        <p class="kicker" appReveal>Portas abertas todos os dias</p>
        <h2 id="cta-title" [appReveal]="120">Venha nos <em>conhecer</em></h2>
        <p class="sub" [appReveal]="220">
          Traga seu pet para um tour: conheça as suítes do hotel, o spa e a clínica. O primeiro petisco é por nossa conta.
        </p>
        <div class="actions" [appReveal]="320">
          <a class="btn btn--gold" [href]="whatsapp" target="_blank" rel="noopener">Agendar visita</a>
          <a class="btn" href="#topo">Voltar ao topo</a>
        </div>
      </div>
    </section>

    <footer class="footer">
      <div class="container cols">
        <div>
          <p class="logo">Mundo <span>✦</span> Pet</p>
          <p class="muted">Hotel · Rações · Banho & Tosa · Veterinário 24h</p>
        </div>
        <nav aria-label="Rodapé">
          @for (l of links; track l.href) {
            <a [href]="l.href">{{ l.label }}</a>
          }
        </nav>
        <div class="muted">
          <p>Seg a Sáb · 8h às 20h<br />Clínica: 24 horas</p>
          <!-- TODO(negocio): endereco real -->
          <p>Endereço da loja · Cidade/UF</p>
        </div>
      </div>
      <p class="container copy muted">© {{ year }} MundoPet. Feito com carinho para quem tem quatro patas.</p>
    </footer>
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
    .footer { border-top: 1px solid var(--line); padding: 56px 0 120px; font-size: .9rem; }
    .cols { display: grid; gap: 32px; }
    .logo { font-family: var(--font-display); letter-spacing: .32em; text-transform: uppercase; margin: 0 0 6px; }
    .logo span { color: var(--gold); }
    nav { display: grid; gap: 4px; }
    nav a { text-decoration: none; padding: 8px 0; color: var(--muted); }
    nav a:hover { color: var(--ink); }
    .muted { color: var(--muted); margin: 0 0 8px; }
    .copy { margin-top: 40px; font-size: .78rem; }
    @media (min-width: 900px) {
      .cta { padding: 180px 0; }
      .actions { flex-direction: row; justify-content: center; max-width: none; }
      .cols { grid-template-columns: 2fr 1fr 1fr; }
      .footer { padding-bottom: 56px; }
    }
    @keyframes drift {
      0% { opacity: 0; transform: translate(0, 0) scale(.6); }
      15% { opacity: .9; }
      100% { opacity: 0; transform: translate(40px, -110vh) scale(1.1); }
    }
  `,
})
export class LandingCta {
  readonly whatsapp = WHATSAPP_URL;
  readonly links = NAV_LINKS;
  readonly petals = makeParticles(18, 42);
  readonly year = new Date().getFullYear();
}
