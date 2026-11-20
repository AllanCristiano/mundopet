import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

import { prefersReducedMotion } from './motion';

/**
 * Revela o elemento (classe .is-visible) quando ele entra na tela.
 * Uso: <h2 appReveal>  ou com atraso em ms: <p [appReveal]="200">
 * Sem IntersectionObserver ou com "reduzir movimento", o conteudo aparece direto (nunca fica invisivel).
 */
@Directive({ selector: '[appReveal]', host: { class: 'reveal' } })
export class RevealDirective implements OnInit, OnDestroy {
  readonly appReveal = input<number | string>('');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const node = this.el.nativeElement;
    const delay = Number(this.appReveal()) || 0;
    if (delay > 0) {
      node.style.transitionDelay = `${delay}ms`;
    }
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-visible');
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          node.classList.add('is-visible');
          this.observer?.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    this.observer.observe(node);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
