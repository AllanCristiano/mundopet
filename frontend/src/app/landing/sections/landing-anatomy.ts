import { Component } from '@angular/core';

import { ANATOMY_LAYERS } from '../landing.data';
import { RevealDirective } from '../motion/reveal.directive';
import { ScrollProgressDirective } from '../motion/scroll-progress.directive';
import { PetArt } from '../pet-art';

/**
 * Vista "explodida": as camadas de servico se separam conforme o scroll e cada uma ganha legenda numerada.
 * data-step: 0-1 = explodindo; 2..6 = legenda da camada (step - 2) ativa.
 */
@Component({
  selector: 'app-landing-anatomy',
  imports: [ScrollProgressDirective, RevealDirective, PetArt],
  templateUrl: './landing-anatomy.html',
  styleUrl: './landing-anatomy.scss',
})
export class LandingAnatomy {
  readonly layers = ANATOMY_LAYERS;
  readonly steps = ANATOMY_LAYERS.length + 2;
}
