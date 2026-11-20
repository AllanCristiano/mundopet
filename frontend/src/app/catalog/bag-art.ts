import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let uid = 0;

/** Embalagem de racao desenhada em SVG, na cor da marca. Substitui foto enquanto nao ha imagens reais. */
@Component({
  selector: 'app-bag-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 120 150">
      <defs>
        <linearGradient [attr.id]="shine" x1="0" x2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".35" />
          <stop offset=".35" stop-color="#fff" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity=".18" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="146" rx="44" ry="4" fill="#000" opacity=".25" />
      <path d="M18 24 L102 24 L108 136 Q108 144 100 144 L20 144 Q12 144 12 136 Z" [attr.fill]="color()" />
      <path d="M18 24 L102 24 L108 136 Q108 144 100 144 L20 144 Q12 144 12 136 Z" [attr.fill]="'url(#' + shine + ')'" />
      <rect x="16" y="10" width="88" height="16" rx="3" [attr.fill]="color()" />
      <rect x="16" y="10" width="88" height="16" rx="3" fill="#000" opacity=".22" />
      <path d="M20 14 l4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" />
      <circle cx="60" cy="64" r="24" fill="#fff" opacity=".94" />
      <text x="60" y="72" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-size="21" font-style="italic" [attr.fill]="color()">{{ initials() }}</text>
      @if (species() === 'GATO') {
        <path d="M50 98 l3-7 4 4 h6 l4-4 3 7 q2 9-10 10 q-12-1-10-10z" fill="#fff" opacity=".9" />
      } @else {
        <g fill="#fff" opacity=".9">
          <ellipse cx="60" cy="102" rx="7" ry="5.5" />
          <circle cx="51" cy="95" r="2.6" /><circle cx="56" cy="91" r="2.6" /><circle cx="64" cy="91" r="2.6" /><circle cx="69" cy="95" r="2.6" />
        </g>
      }
      <rect x="32" y="114" width="56" height="18" rx="9" fill="#fff" opacity=".94" />
      <text x="60" y="127" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10" font-weight="700" fill="#1a1208">{{ weight() }}</text>
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; height: 100%; overflow: visible; }
  `,
})
export class BagArt {
  readonly color = input('#e3b062');
  readonly brand = input('');
  readonly species = input<'CAO' | 'GATO'>('CAO');
  readonly weightKg = input(1);
  readonly shine = `bag-shine-${++uid}`;

  readonly initials = computed(() =>
    this.brand()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join(''),
  );

  readonly weight = computed(() => `${this.weightKg().toLocaleString('pt-BR', { maximumFractionDigits: 2 })} KG`);
}
