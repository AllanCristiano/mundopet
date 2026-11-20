import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SiteConfigService } from '../../core/site-config';
import { SERVICES } from '../landing.data';
import { RevealDirective } from '../motion/reveal.directive';
import { ScrollProgressDirective } from '../motion/scroll-progress.directive';
import { PetArt } from '../pet-art';

@Component({
  selector: 'app-landing-chapters',
  imports: [ScrollProgressDirective, RevealDirective, PetArt, RouterLink],
  templateUrl: './landing-chapters.html',
  styleUrl: './landing-chapters.scss',
})
export class LandingChapters {
  private readonly site = inject(SiteConfigService);
  /** So os servicos ligados na gestao, na ordem e com numeracao 01, 02... */
  readonly chapters = this.site.chapters;
  readonly whatsapp = this.site.whatsappUrl;
  /** Faixa infinita: repetida para o loop nao ter emenda. */
  readonly marquee = [...SERVICES, ...SERVICES, ...SERVICES];
  /** Quantidade de elementos decorativos animados por cena (estrelas, racao, bolhas...). */
  readonly bits = Array.from({ length: 12 }, (_, i) => i);
}
