import { Component } from '@angular/core';

import { LandingAnatomy } from './sections/landing-anatomy';
import { LandingBeauty } from './sections/landing-beauty';
import { LandingApp } from './sections/landing-app';
import { LandingChapters } from './sections/landing-chapters';
import { LandingCta } from './sections/landing-cta';
import { LandingFooter } from './sections/landing-footer';
import { LandingHero } from './sections/landing-hero';
import { LandingNav } from './sections/landing-nav';
import { LandingProof } from './sections/landing-proof';

/** Landing page publica (mobile first, animacao cinematografica guiada pelo scroll). */
@Component({
  selector: 'app-landing-page',
  imports: [LandingNav, LandingHero, LandingAnatomy, LandingChapters, LandingBeauty, LandingProof, LandingApp, LandingCta, LandingFooter],
  template: `
    <app-landing-nav />
    <main>
      <app-landing-hero />
      <app-landing-anatomy />
      <app-landing-chapters />
      <app-landing-beauty />
      <app-landing-proof />
      <app-landing-app />
    </main>
    <app-landing-cta />
    <app-landing-footer />
  `,
})
export class LandingPage {}
