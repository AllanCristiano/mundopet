import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SiteConfigService } from '../../core/site-config';
import { RevealDirective } from '../motion/reveal.directive';
import { LandingMap } from './landing-map';

@Component({
  selector: 'app-landing-footer',
  imports: [LandingMap, RevealDirective, RouterLink],
  templateUrl: './landing-footer.html',
  styleUrl: './landing-footer.scss',
})
export class LandingFooter {
  private readonly site = inject(SiteConfigService);
  readonly store = this.site.store;
  readonly info = computed(() => this.site.settings().store);
  readonly whatsapp = this.site.whatsappUrl;
  readonly services = computed(() => this.site.navLinks().filter((l) => l.href.startsWith('#') && l.href !== '#app'));
  readonly year = new Date().getFullYear();
}
