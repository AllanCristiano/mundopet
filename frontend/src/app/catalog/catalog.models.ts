export type Species = 'CAO' | 'GATO';
export type LifeStage = 'FILHOTE' | 'ADULTO' | 'SENIOR';
export type PetSize = 'PEQUENO' | 'MEDIO' | 'GRANDE' | 'TODOS';
export type FoodLine = 'PREMIUM' | 'SUPER_PREMIUM' | 'NATURAL' | 'TERAPEUTICA';
export type Sort = 'RELEVANCE' | 'PRICE_ASC' | 'PRICE_DESC' | 'DISCOUNT' | 'NAME';
export type Fulfillment = 'PICKUP' | 'DELIVERY';

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  species: Species;
  lifeStage: LifeStage;
  petSize: PetSize;
  line: FoodLine;
  flavor: string | null;
  weightKg: number;
  price: number;
  promoPrice: number | null;
  promoEndsAt: string | null;
  discountPercent: number | null;
  effectivePrice: number;
  pricePerKg: number;
  stock: number;
  inStock: boolean;
  color: string;
  description: string | null;
}

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface Facets {
  brands: Record<string, number>;
  prices: { min: number; max: number; promoCount: number; total: number };
}

export interface Filters {
  q: string;
  species: Species | null;
  stage: LifeStage[];
  petSize: PetSize[];
  line: FoodLine[];
  brand: string[];
  minPrice: number | null;
  maxPrice: number | null;
  promo: boolean;
  sort: Sort;
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  species: null,
  stage: [],
  petSize: [],
  line: [],
  brand: [],
  minPrice: null,
  maxPrice: null,
  promo: false,
  sort: 'RELEVANCE',
};

export interface QuoteLine {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  weightKg: number;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  lineTotal: number;
  promo: boolean;
  warning: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  unavailable: string[];
  itemsCount: number;
  subtotal: number;
  discount: number;
  /** Produtos (ja com descontos). */
  itemsTotal: number;
  deliveryFee: number;
  /** Produtos + entrega. */
  total: number;
  /** So vem quando o pedido e de entrega. */
  delivery: DeliveryQuote | null;
  /** Nulo quando nao da para enviar (ex.: fora da area de entrega). */
  whatsappText: string | null;
}

/** Taxa de entrega por distancia (preco fixo por km), calculada no servidor. */
export interface DeliveryQuote {
  status: 'OK' | 'OUT_OF_AREA' | 'UNKNOWN';
  distanceKm: number | null;
  fee: number | null;
  pricePerKm: number;
  maxKm: number;
}

/** 3.2 -> "3,2 km" */
export function km(value: number | null | undefined): string {
  return `${(value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

export interface QuoteRequest {
  items: { productId: string; quantity: number }[];
  customerName: string | null;
  fulfillment: Fulfillment;
  notes: string | null;
  address?: {
    cep: string;
    street: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    state: string;
    reference: string | null;
  } | null;
}

// ---------------- Rotulos em portugues ----------------
export const SPECIES_LABEL: Record<Species, string> = { CAO: 'Cães', GATO: 'Gatos' };
export const STAGE_LABEL: Record<LifeStage, string> = { FILHOTE: 'Filhote', ADULTO: 'Adulto', SENIOR: 'Sênior' };
export const SIZE_LABEL: Record<PetSize, string> = {
  PEQUENO: 'Pequeno',
  MEDIO: 'Médio',
  GRANDE: 'Grande',
  TODOS: 'Todos os portes',
};
export const LINE_LABEL: Record<FoodLine, string> = {
  PREMIUM: 'Premium',
  SUPER_PREMIUM: 'Super Premium',
  NATURAL: 'Natural',
  TERAPEUTICA: 'Terapêutica',
};
export const SORT_LABEL: Record<Sort, string> = {
  RELEVANCE: 'Destaques',
  PRICE_ASC: 'Menor preço',
  PRICE_DESC: 'Maior preço',
  DISCOUNT: 'Maior desconto',
  NAME: 'Nome (A–Z)',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function money(value: number): string {
  return BRL.format(value).replace(/ /g, ' ');
}

export function kg(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
}
