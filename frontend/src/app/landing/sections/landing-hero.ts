import { Component, afterNextRender, signal } from '@angular/core';

import { PILLARS, WHATSAPP_URL } from '../landing.data';
import { ScrollProgressDirective } from '../motion/scroll-progress.directive';
import { PetArt } from '../pet-art';

/** Gera particulas de "poeira dourada" deterministicas (mesmo resultado em todo render). */
export function makeParticles(count: number, seed = 7) {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: count }, () => ({
    x: Math.round(rand() * 100),
    y: Math.round(rand() * 100),
    size: 2 + Math.round(rand() * 4),
    delay: -Math.round(rand() * 12),
    duration: 9 + Math.round(rand() * 10),
  }));
}

@Component({
  selector: 'app-landing-hero',
  imports: [ScrollProgressDirective, PetArt],
  templateUrl: './landing-hero.html',
  styleUrl: './landing-hero.scss',
})
export class LandingHero {
  readonly pillars = PILLARS;
  readonly whatsapp = WHATSAPP_URL;
  readonly particles = makeParticles(22);
  readonly titleWords = ['Tudo', 'o', 'que', 'o', 'seu', 'melhor', 'amigo'];
  readonly drawn = signal(false);

  constructor() {
    afterNextRender(() => requestAnimationFrame(() => this.drawn.set(true)));
  }
}
