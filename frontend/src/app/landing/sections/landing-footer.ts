import { Component } from '@angular/core';

import { NAV_LINKS, STORE, WHATSAPP_URL } from '../landing.data';
import { RevealDirective } from '../motion/reveal.directive';
import { LandingMap } from './landing-map';

@Component({
  selector: 'app-landing-footer',
  imports: [LandingMap, RevealDirective],
  templateUrl: './landing-footer.html',
  styleUrl: './landing-footer.scss',
})
export class LandingFooter {
  readonly store = STORE;
  readonly whatsapp = WHATSAPP_URL;
  readonly services = NAV_LINKS.filter((l) => l.href !== '#app');
  readonly year = new Date().getFullYear();
}
