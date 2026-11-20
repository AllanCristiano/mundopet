import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { NAV_LINKS, STORE, WHATSAPP_URL } from '../landing.data';
import { RevealDirective } from '../motion/reveal.directive';
import { LandingMap } from './landing-map';

@Component({
  selector: 'app-landing-footer',
  imports: [LandingMap, RevealDirective, RouterLink],
  templateUrl: './landing-footer.html',
  styleUrl: './landing-footer.scss',
})
export class LandingFooter {
  readonly store = STORE;
  readonly whatsapp = WHATSAPP_URL;
  readonly services = NAV_LINKS.filter((l) => l.href.startsWith('#') && l.href !== '#app');
  readonly year = new Date().getFullYear();
}
