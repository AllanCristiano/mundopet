import { Component } from '@angular/core';

import { LandingAnatomy } from './sections/landing-anatomy';
import { LandingChapters } from './sections/landing-chapters';
import { LandingCta } from './sections/landing-cta';
import { LandingHero } from './sections/landing-hero';
import { LandingNav } from './sections/landing-nav';
import { LandingProof } from './sections/landing-proof';

/** Landing page publica (mobile first, animacao cinematografica guiada pelo scroll). */
@Component({
  selector: 'app-landing-page',
  imports: [LandingNav, LandingHero, LandingAnatomy, LandingChapters, LandingProof, LandingCta],
  template: `
    <app-landing-nav />
    <main>
      <app-landing-hero />
      <app-landing-anatomy />
      <app-landing-chapters />
      <app-landing-proof />
    </main>
    <app-landing-cta />
  `,
})
export class LandingPage {}
