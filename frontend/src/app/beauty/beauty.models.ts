// Espaco Beleza: tipos e rotulos.

export type Species = 'CAO' | 'GATO' | 'OUTRO';
export type BeautyService = 'BANHO' | 'TOSA' | 'BANHO_TOSA' | 'HIDRATACAO' | 'SPA' | 'OUTRO';

export interface BeautyPhoto {
  id: string;
  petName: string;
  species: Species;
  service: BeautyService;
  caption: string | null;
  width: number;
  height: number;
  createdAt: string;
  thumbUrl: string;
  fullUrl: string;
}

export interface PhotoPage {
  items: BeautyPhoto[];
  page: number;
  size: number;
  hasMore: boolean;
}

export interface Testimonial {
  id: string;
  author: string;
  petName: string | null;
  rating: number;
  message: string;
  status: 'PENDING' | 'APPROVED';
  createdAt: string;
}

export interface TestimonialPage {
  items: Testimonial[];
  page: number;
  size: number;
  hasMore: boolean;
  summary: { average: number; count: number };
}

export interface NewTestimonial {
  author: string;
  petName: string | null;
  rating: number;
  message: string;
  /** Campo-isca invisivel (anti-robo). Pessoas deixam vazio. */
  website: string;
}

export interface PhotoForm {
  petName: string;
  species: Species;
  service: BeautyService;
  caption: string;
}

export const SERVICE_LABELS: Record<BeautyService, string> = {
  BANHO: 'Banho',
  TOSA: 'Tosa',
  BANHO_TOSA: 'Banho & Tosa',
  HIDRATACAO: 'Hidratação',
  SPA: 'Spa',
  OUTRO: 'Outro',
};

export const SPECIES_LABELS: Record<Species, string> = { CAO: 'Cão', GATO: 'Gato', OUTRO: 'Outro' };

/** Ordem dos filtros da galeria. */
export const SERVICE_FILTERS: BeautyService[] = ['BANHO_TOSA', 'BANHO', 'TOSA', 'HIDRATACAO', 'SPA'];

export const MESSAGE_MAX = 600;
export const MESSAGE_MIN = 10;

/** 4.75 -> "4,8" */
export function rating(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** 4 -> "★★★★☆" */
export function stars(n: number): string {
  const full = Math.max(0, Math.min(5, Math.round(n)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/** "tutor(a) do Thor" de forma neutra: "com o Thor". */
export function authorLine(t: Pick<Testimonial, 'author' | 'petName'>): string {
  return t.petName ? `${t.author} · com ${t.petName}` : t.author;
}
