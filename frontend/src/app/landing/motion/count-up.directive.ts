import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, input } from '@angular/core';

import { prefersReducedMotion } from './motion';

/** Conta de 0 ate o valor quando o numero aparece na tela. Ex.: <span [appCountUp]="4.9" [decimals]="1"> */
@Directive({ selector: '[appCountUp]' })
export class CountUpDirective implements OnInit, OnDestroy {
  readonly appCountUp = input.required<number>();
  readonly decimals = input(0);
  readonly prefix = input('');
  readonly suffix = input('');
  readonly duration = input(1800);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private observer?: IntersectionObserver;
  private frame = 0;

  ngOnInit(): void {
    this.render(0);
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      this.render(this.appCountUp());
      return;
    }
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        this.observer?.disconnect();
        this.zone.runOutsideAngular(() => this.animate());
      }
    });
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  format(value: number): string {
    const n = value.toLocaleString('pt-BR', {
      minimumFractionDigits: this.decimals(),
      maximumFractionDigits: this.decimals(),
    });
    return `${this.prefix()}${n}${this.suffix()}`;
  }

  private animate(): void {
    const start = performance.now();
    const target = this.appCountUp();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / this.duration());
      const eased = 1 - Math.pow(1 - t, 3);
      this.render(target * eased);
      this.frame = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    this.frame = requestAnimationFrame(tick);
  }

  private render(value: number): void {
    this.el.nativeElement.textContent = this.format(value);
  }
}
