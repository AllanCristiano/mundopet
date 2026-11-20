import { Component, ElementRef, computed, effect, input, model, viewChild } from '@angular/core';

import { BeautyPhoto, SERVICE_LABELS } from './beauty.models';

/**
 * Foto ampliada: setas/teclado/arrastar para navegar, Esc ou fundo para fechar.
 * index = posicao em photos(); null = fechado.
 */
@Component({
  selector: 'app-photo-lightbox',
  host: {
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    @if (current(); as p) {
      <div class="shade" (click)="close()" aria-hidden="true"></div>
      <figure
        class="box"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Foto de ' + p.petName"
        (pointerdown)="down($event)"
        (pointerup)="up($event)"
      >
        @for (k of [p.id]; track k) {
          <img class="photo" [src]="p.fullUrl" [alt]="'Foto de ' + p.petName + ' depois do ' + label(p).toLowerCase()" [style.aspect-ratio]="p.width + ' / ' + p.height" />
        }
        <figcaption>
          <strong>{{ p.petName }}</strong>
          <span class="tag">{{ label(p) }}</span>
          @if (p.caption) {
            <span class="cap">{{ p.caption }}</span>
          }
          <span class="pos">{{ index()! + 1 }} / {{ photos().length }}</span>
        </figcaption>
        <button #closeBtn type="button" class="x" (click)="close()" aria-label="Fechar foto">✕</button>
        @if (photos().length > 1) {
          <button type="button" class="nav prev" (click)="go(-1)" aria-label="Foto anterior">‹</button>
          <button type="button" class="nav next" (click)="go(1)" aria-label="Próxima foto">›</button>
        }
      </figure>
    }
  `,
  styleUrl: './photo-lightbox.scss',
})
export class PhotoLightbox {
  readonly photos = input.required<BeautyPhoto[]>();
  readonly index = model<number | null>(null);

  readonly current = computed(() => {
    const i = this.index();
    return i == null ? null : (this.photos()[i] ?? null);
  });

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private startX: number | null = null;
  private opener: Element | null = null;

  constructor() {
    // foco vai para o "fechar" ao abrir e volta para a foto clicada ao fechar; trava a rolagem do fundo
    effect(() => {
      const open = this.current() != null;
      if (open) {
        this.opener ??= document.activeElement;
        queueMicrotask(() => this.closeBtn()?.nativeElement.focus());
      } else if (this.opener) {
        (this.opener as HTMLElement).focus?.();
        this.opener = null;
      }
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  label(p: BeautyPhoto): string {
    return SERVICE_LABELS[p.service];
  }

  close(): void {
    this.index.set(null);
  }

  go(step: number): void {
    const n = this.photos().length;
    const i = this.index();
    if (i == null || n === 0) return;
    this.index.set((i + step + n) % n);
  }

  onKey(e: KeyboardEvent): void {
    if (this.index() == null) return;
    if (e.key === 'Escape') this.close();
    else if (e.key === 'ArrowRight') this.go(1);
    else if (e.key === 'ArrowLeft') this.go(-1);
  }

  down(e: PointerEvent): void {
    this.startX = e.clientX;
  }

  /** Arrastar o dedo para o lado troca de foto. */
  up(e: PointerEvent): void {
    if (this.startX == null) return;
    const dx = e.clientX - this.startX;
    this.startX = null;
    if (Math.abs(dx) > 50) this.go(dx < 0 ? 1 : -1);
  }
}
