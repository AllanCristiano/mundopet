import { Component } from '@angular/core';

import { CHAPTERS, NAV_LINKS, WHATSAPP_URL } from '../landing.data';
import { RevealDirective } from '../motion/reveal.directive';
import { ScrollProgressDirective } from '../motion/scroll-progress.directive';
import { PetArt } from '../pet-art';

@Component({
  selector: 'app-landing-chapters',
  imports: [ScrollProgressDirective, RevealDirective, PetArt],
  templateUrl: './landing-chapters.html',
  styleUrl: './landing-chapters.scss',
})
export class LandingChapters {
  readonly chapters = CHAPTERS;
  readonly whatsapp = WHATSAPP_URL;
  /** Faixa infinita: repetida para o loop nao ter emenda. */
  readonly marquee = [...NAV_LINKS, ...NAV_LINKS, ...NAV_LINKS].map((l) => l.label);
  /** Quantidade de elementos decorativos animados por cena (estrelas, racao, bolhas...). */
  readonly bits = Array.from({ length: 12 }, (_, i) => i);
}
