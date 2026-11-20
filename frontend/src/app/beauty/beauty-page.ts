import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ThemeToggle } from '../core/theme-toggle';
import { SiteConfigService } from '../core/site-config';
import { RevealDirective } from '../landing/motion/reveal.directive';
import { BeautyApi } from './beauty.api';
import {
  BeautyPhoto,
  BeautyService,
  SERVICE_FILTERS,
  SERVICE_LABELS,
  Testimonial,
  TestimonialPage,
  authorLine,
  rating,
  stars,
} from './beauty.models';
import { PhotoLightbox } from './photo-lightbox';
import { TestimonialForm } from './testimonial-form';

export const PHOTOS_PAGE = 24;
export const TESTIMONIALS_PAGE = 9;

/** /beleza: galeria dos pets que passaram pelo spa + depoimentos. Mobile first. */
@Component({
  selector: 'app-beauty-page',
  imports: [RouterLink, ThemeToggle, RevealDirective, PhotoLightbox, TestimonialForm],
  templateUrl: './beauty-page.html',
  styleUrl: './beauty-page.scss',
})
export class BeautyPage {
  private readonly api = inject(BeautyApi);
  private readonly site = inject(SiteConfigService);

  readonly filters = SERVICE_FILTERS;
  readonly labels = SERVICE_LABELS;
  readonly stars = stars;
  readonly rating = rating;
  readonly authorLine = authorLine;
  readonly bubbles = Array.from({ length: 10 }, (_, i) => i);
  readonly booking = computed(() => this.site.whatsappLink('Olá! Quero agendar banho e tosa no Espaço Beleza do MundoPet 🛁'));

  // galeria
  readonly service = signal<BeautyService | null>(null);
  readonly photos = signal<BeautyPhoto[]>([]);
  readonly photosPage = signal(0);
  readonly photosMore = signal(false);
  readonly photosLoading = signal(true);
  readonly photosError = signal<string | null>(null);
  readonly open = signal<number | null>(null);

  // depoimentos
  readonly testimonials = signal<Testimonial[]>([]);
  readonly summary = signal<TestimonialPage['summary'] | null>(null);
  readonly testimonialsPage = signal(0);
  readonly testimonialsMore = signal(false);
  readonly testimonialsLoading = signal(true);
  readonly testimonialsError = signal<string | null>(null);

  readonly hasRating = computed(() => (this.summary()?.count ?? 0) > 0);

  constructor() {
    this.loadPhotos(0);
    this.loadTestimonials(0);
  }

  pick(service: BeautyService | null): void {
    if (this.service() === service) return;
    this.service.set(service);
    this.loadPhotos(0);
  }

  loadPhotos(page: number): void {
    this.photosLoading.set(true);
    this.photosError.set(null);
    const service = this.service();
    this.api.photos(service, page, PHOTOS_PAGE).subscribe({
      next: (p) => {
        if (service !== this.service()) return; // filtro mudou no meio do caminho
        this.photos.set(page === 0 ? p.items : [...this.photos(), ...p.items]);
        this.photosPage.set(page);
        this.photosMore.set(p.hasMore);
        this.photosLoading.set(false);
      },
      error: (e: Error) => {
        this.photosError.set(e.message);
        this.photosLoading.set(false);
      },
    });
  }

  loadTestimonials(page: number): void {
    this.testimonialsLoading.set(true);
    this.testimonialsError.set(null);
    this.api.testimonials(page, TESTIMONIALS_PAGE).subscribe({
      next: (p) => {
        this.testimonials.set(page === 0 ? p.items : [...this.testimonials(), ...p.items]);
        this.summary.set(p.summary);
        this.testimonialsPage.set(page);
        this.testimonialsMore.set(p.hasMore);
        this.testimonialsLoading.set(false);
      },
      error: (e: Error) => {
        this.testimonialsError.set(e.message);
        this.testimonialsLoading.set(false);
      },
    });
  }

  /** Atraso escalonado so dentro de cada "pagina" carregada. */
  delay(i: number): number {
    return (i % PHOTOS_PAGE) * 60;
  }
}
