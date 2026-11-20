import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ArtKind } from './landing.data';

/**
 * Ilustracoes em traco (line art). Cada forma usa pathLength="1", entao a animacao de "desenhar"
 * e so stroke-dashoffset 1 -> 0 (classe .is-drawn no host, ou .is-visible de um ancestral).
 */
@Component({
  selector: 'app-pet-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
  },
  styles: `
    :host { display: block; color: var(--gold); }
    svg { width: 100%; height: 100%; overflow: visible; }
    .s {
      fill: none;
      stroke: currentColor;
      stroke-width: var(--stroke, 2.2);
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      transition: stroke-dashoffset 2.2s var(--ease-out);
      transition-delay: calc(var(--d, 0) * 120ms);
    }
    .f { fill: currentColor; stroke: none; opacity: 0; transition: opacity 0.8s 1.2s; }
    :host(.is-drawn) .s, :host-context(.is-visible) .s { stroke-dashoffset: 0; }
    :host(.is-drawn) .f, :host-context(.is-visible) .f { opacity: 1; }
    @media (prefers-reduced-motion: reduce) { .s { stroke-dashoffset: 0; } .f { opacity: 1; } }
  `,
  template: `
    <svg viewBox="0 0 200 200" aria-hidden="true">
      @switch (kind()) {
        @case ('dog') {
          <path class="s" style="--d:0" pathLength="1" d="M62 72 Q100 42 138 72 Q156 110 140 146 Q100 176 60 146 Q44 110 62 72 Z" />
          <path class="s" style="--d:1" pathLength="1" d="M64 74 Q34 58 28 98 Q28 132 52 128 Q60 112 62 92" />
          <path class="s" style="--d:1" pathLength="1" d="M136 74 Q166 58 172 98 Q172 132 148 128 Q140 112 138 92" />
          <ellipse class="s" style="--d:2" pathLength="1" cx="100" cy="134" rx="24" ry="17" />
          <path class="f" d="M90 124 Q100 117 110 124 Q100 134 90 124 Z" />
          <path class="s" style="--d:3" pathLength="1" d="M100 131 L100 140 Q92 148 85 142 M100 140 Q108 148 115 142" />
          <circle class="f" cx="82" cy="102" r="5.5" />
          <circle class="f" cx="118" cy="102" r="5.5" />
          <path class="s" style="--d:4" pathLength="1" d="M74 88 Q82 83 90 88 M110 88 Q118 83 126 88" />
        }
        @case ('cat') {
          <path class="s" style="--d:0" pathLength="1" d="M58 92 L52 40 L86 66 Q100 62 114 66 L148 40 L142 92 Q156 140 100 162 Q44 140 58 92 Z" />
          <path class="s" style="--d:1" pathLength="1" d="M96 124 L104 124 L100 130 Z M100 130 Q94 140 86 136 M100 130 Q106 140 114 136" />
          <path class="s" style="--d:2" pathLength="1" d="M40 118 L78 126 M40 132 L78 132 M160 118 L122 126 M160 132 L122 132" />
          <ellipse class="f" cx="80" cy="104" rx="5" ry="7" />
          <ellipse class="f" cx="120" cy="104" rx="5" ry="7" />
        }
        @case ('house') {
          <path class="s" style="--d:0" pathLength="1" d="M30 100 L100 42 L170 100" />
          <path class="s" style="--d:1" pathLength="1" d="M48 88 L48 162 L152 162 L152 88" />
          <path class="s" style="--d:2" pathLength="1" d="M84 162 L84 124 Q100 106 116 124 L116 162" />
          <path class="s" style="--d:3" pathLength="1" d="M128 62 L128 40 L144 40 L144 76" />
          <circle class="f" cx="100" cy="82" r="7" />
        }
        @case ('bowl') {
          <path class="s" style="--d:0" pathLength="1" d="M30 110 L170 110 Q164 162 100 166 Q36 162 30 110 Z" />
          <path class="s" style="--d:1" pathLength="1" d="M56 110 Q60 88 80 92 Q90 74 108 86 Q126 76 136 94 Q150 92 146 110" />
          <path class="s" style="--d:2" pathLength="1" d="M70 136 Q100 146 130 136" />
          <circle class="f" cx="82" cy="100" r="5" />
          <circle class="f" cx="104" cy="96" r="5" />
          <circle class="f" cx="124" cy="102" r="5" />
        }
        @case ('scissors') {
          <circle class="s" style="--d:0" pathLength="1" cx="62" cy="146" r="20" />
          <circle class="s" style="--d:0" pathLength="1" cx="138" cy="146" r="20" />
          <path class="s" style="--d:1" pathLength="1" d="M74 130 L150 38 M126 130 L50 38" />
          <circle class="s" style="--d:2" pathLength="1" cx="164" cy="74" r="10" />
          <circle class="s" style="--d:3" pathLength="1" cx="40" cy="80" r="7" />
          <path class="s" style="--d:4" pathLength="1" d="M100 20 L104 32 L116 36 L104 40 L100 52 L96 40 L84 36 L96 32 Z" />
        }
        @case ('heart') {
          <path class="s" style="--d:0" pathLength="1" d="M100 164 Q34 120 34 78 Q34 46 64 44 Q88 44 100 66 Q112 44 136 44 Q166 46 166 78 Q166 120 100 164 Z" />
          <path class="s" style="--d:2" pathLength="1" d="M48 100 L80 100 L90 78 L104 124 L116 92 L124 100 L152 100" />
        }
      }
    </svg>
  `,
})
export class PetArt {
  readonly kind = input.required<ArtKind>();
  readonly label = input('');
}
