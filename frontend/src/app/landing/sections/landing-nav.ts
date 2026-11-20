import { RouterLink } from '@angular/router';
import { Component, ElementRef, NgZone, OnDestroy, OnInit, inject, signal } from '@angular/core';

import { ThemeToggle } from '../../core/theme-toggle';
import { SiteConfigService } from '../../core/site-config';

@Component({
  selector: 'app-landing-nav',
  imports: [ThemeToggle, RouterLink],
  templateUrl: './landing-nav.html',
  styleUrl: './landing-nav.scss',
  host: { '[class.menu-open]': 'open()' },
})
export class LandingNav implements OnInit, OnDestroy {
  private readonly site = inject(SiteConfigService);
  readonly links = this.site.navLinks;
  readonly whatsapp = this.site.whatsappUrl;
  readonly open = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly onScroll = () => this.syncScroll();

  ngOnInit(): void {
    this.syncScroll();
    // Fora da zona: rolar a pagina nao dispara change detection
    this.zone.runOutsideAngular(() => window.addEventListener('scroll', this.onScroll, { passive: true }));
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
    document.body.style.overflow = '';
  }

  /** Publico para testes. */
  syncScroll(): void {
    const y = window.scrollY;
    const el = this.host.nativeElement;
    el.classList.toggle('is-scrolled', y > 24);
    el.classList.toggle('show-bar', y > window.innerHeight * 0.8);
  }

  toggle(): void {
    this.open.update((v) => !v);
    document.body.style.overflow = this.open() ? 'hidden' : '';
  }

  close(): void {
    this.open.set(false);
    document.body.style.overflow = '';
  }
}
