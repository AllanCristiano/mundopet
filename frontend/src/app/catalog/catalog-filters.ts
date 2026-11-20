import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  Facets,
  Filters,
  FoodLine,
  LINE_LABEL,
  LifeStage,
  PetSize,
  SIZE_LABEL,
  STAGE_LABEL,
  Species,
} from './catalog.models';

export const PRICE_RANGES: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Até R$ 100', min: null, max: 100 },
  { label: 'R$ 100 a 200', min: 100, max: 200 },
  { label: 'R$ 200 a 300', min: 200, max: 300 },
  { label: 'Acima de R$ 300', min: 300, max: null },
];

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

@Component({
  selector: 'app-catalog-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog-filters.html',
  styleUrl: './catalog-filters.scss',
})
export class CatalogFilters {
  readonly filters = input.required<Filters>();
  readonly facets = input<Facets | null>(null);
  readonly changed = output<Partial<Filters>>();
  readonly cleared = output<void>();

  readonly species: { value: Species | null; label: string; icon: string }[] = [
    { value: null, label: 'Todos', icon: '✦' },
    { value: 'CAO', label: 'Cães', icon: '🐶' },
    { value: 'GATO', label: 'Gatos', icon: '🐱' },
  ];
  readonly stages = Object.entries(STAGE_LABEL) as [LifeStage, string][];
  readonly sizes = (Object.entries(SIZE_LABEL) as [PetSize, string][]).filter(([k]) => k !== 'TODOS');
  readonly lines = Object.entries(LINE_LABEL) as [FoodLine, string][];
  readonly ranges = PRICE_RANGES;
  readonly brands = computed(() => Object.entries(this.facets()?.brands ?? {}));

  toggleStage(v: LifeStage) {
    this.changed.emit({ stage: toggle(this.filters().stage, v) });
  }

  toggleSize(v: PetSize) {
    this.changed.emit({ petSize: toggle(this.filters().petSize, v) });
  }

  toggleLine(v: FoodLine) {
    this.changed.emit({ line: toggle(this.filters().line, v) });
  }

  toggleBrand(v: string) {
    this.changed.emit({ brand: toggle(this.filters().brand, v) });
  }

  setRange(r: { min: number | null; max: number | null }) {
    const f = this.filters();
    const active = f.minPrice === r.min && f.maxPrice === r.max;
    this.changed.emit(active ? { minPrice: null, maxPrice: null } : { minPrice: r.min, maxPrice: r.max });
  }

  isRange(r: { min: number | null; max: number | null }) {
    return this.filters().minPrice === r.min && this.filters().maxPrice === r.max;
  }

  priceInput(which: 'minPrice' | 'maxPrice', raw: string) {
    const n = raw.trim() === '' ? null : Math.max(0, Number(raw));
    this.changed.emit({ [which]: n === null || Number.isNaN(n) ? null : n });
  }
}
