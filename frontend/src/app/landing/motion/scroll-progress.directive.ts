import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, input } from '@angular/core';

import { clamp01, prefersReducedMotion } from './motion';

/**
 * Animacao guiada pelo scroll, sem disparar change detection:
 *  - escreve a variavel CSS --p (0 a 1) no elemento; o CSS usa calc(var(--p)) em transform/opacity;
 *  - opcionalmente escreve data-step (0..steps-1) para trocar estados por seletor CSS.
 *
 * mode "pin":  secao alta com conteudo sticky. 0 = topo da secao no topo da tela, 1 = fim da secao.
 * mode "view": secao normal. 0 = entrando por baixo, 1 = saindo por cima (parallax).
 */
@Directive({ selector: '[appScrollProgress]' })
export class ScrollProgressDirective implements OnInit, OnDestroy {
  readonly mode = input<'pin' | 'view'>('pin');
  readonly steps = input(0);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private frame = 0;
  private lastStep = -1;
  private readonly onScroll = () => {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.update();
      });
    }
  };

  ngOnInit(): void {
    this.update();
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onScroll, { passive: true });
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  /** Calcula o progresso atual. Publico para testes. */
  update(): number {
    const node = this.el.nativeElement;
    const rect = node.getBoundingClientRect();
    const vh = window.innerHeight || 1;

    let progress: number;
    if (this.mode() === 'pin') {
      const scrollable = rect.height - vh;
      progress = scrollable > 0 ? clamp01(-rect.top / scrollable) : rect.top <= 0 ? 1 : 0;
    } else {
      progress = clamp01((vh - rect.top) / (vh + rect.height));
    }

    // Parallax causa enjoo em quem pediu "reduzir movimento": congela no estado final
    const visual = prefersReducedMotion() && this.mode() === 'view' ? 0.5 : progress;
    node.style.setProperty('--p', visual.toFixed(4));

    const steps = this.steps();
    if (steps > 0) {
      const step = Math.min(steps - 1, Math.floor(progress * steps));
      if (step !== this.lastStep) {
        this.lastStep = step;
        node.setAttribute('data-step', String(step));
      }
    }
    return progress;
  }
}
