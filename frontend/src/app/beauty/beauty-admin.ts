import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { from, switchMap } from 'rxjs';

import { ThemeToggle } from '../core/theme-toggle';
import { BeautyApi } from './beauty.api';
import {
  BeautyPhoto,
  BeautyService,
  MESSAGE_MIN,
  PhotoForm,
  SERVICE_FILTERS,
  SERVICE_LABELS,
  SPECIES_LABELS,
  Species,
  Testimonial,
  authorLine,
  stars,
} from './beauty.models';
import { prepareImage } from './image-resize';

/** Token so na sessao da aba (fecha a aba = sai). Nunca vai para o localStorage. */
export const ADMIN_TOKEN_KEY = 'mundopet-admin-token';

function readToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* armazenamento bloqueado: segue so em memoria */
  }
}

const EMPTY_FORM: PhotoForm = { petName: '', species: 'CAO', service: 'BANHO_TOSA', caption: '' };

/** /beleza/admin: a clinica envia fotos e modera depoimentos. */
@Component({
  selector: 'app-beauty-admin',
  imports: [RouterLink, ThemeToggle],
  templateUrl: './beauty-admin.html',
  styleUrl: './beauty-admin.scss',
})
export class BeautyAdmin {
  private readonly api = inject(BeautyApi);

  readonly services: BeautyService[] = [...SERVICE_FILTERS, 'OUTRO'];
  readonly species: Species[] = ['CAO', 'GATO', 'OUTRO'];
  readonly serviceLabels = SERVICE_LABELS;
  readonly speciesLabels = SPECIES_LABELS;
  readonly stars = stars;
  readonly authorLine = authorLine;

  // ---------- acesso ----------
  readonly token = signal(readToken());
  readonly tokenInput = signal('');
  readonly checking = signal(false);
  readonly loginError = signal<string | null>(null);
  readonly tab = signal<'photos' | 'testimonials'>('photos');

  // ---------- fotos ----------
  readonly form = signal<PhotoForm>({ ...EMPTY_FORM });
  readonly file = signal<File | null>(null);
  readonly preview = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly uploadMsg = signal<{ ok: boolean; text: string } | null>(null);
  readonly photos = signal<BeautyPhoto[]>([]);
  readonly photosMore = signal(false);
  private photosPage = 0;
  readonly confirmDelete = signal<string | null>(null);

  readonly canUpload = computed(() => !!this.file() && this.form().petName.trim().length > 0 && !this.uploading());

  // ---------- depoimentos ----------
  readonly pending = signal<Testimonial[]>([]);
  readonly modError = signal<string | null>(null);
  readonly manual = signal({ author: '', petName: '', rating: 5, message: '' });
  readonly manualMsg = signal<string | null>(null);
  readonly manualOk = computed(() => this.manual().author.trim().length > 0 && this.manual().message.trim().length >= MESSAGE_MIN);

  constructor() {
    if (this.token()) this.loadAll();
  }

  // ---------- acesso ----------

  login(e: Event): void {
    e.preventDefault();
    const token = this.tokenInput().trim();
    if (!token || this.checking()) return;
    this.checking.set(true);
    this.loginError.set(null);
    this.api.check(token).subscribe({
      next: () => {
        this.checking.set(false);
        this.token.set(token);
        this.tokenInput.set('');
        writeToken(token);
        this.loadAll();
      },
      error: (err: Error) => {
        this.checking.set(false);
        this.loginError.set(err.message);
      },
    });
  }

  logout(): void {
    this.token.set('');
    writeToken(null);
    this.photos.set([]);
    this.pending.set([]);
  }

  /** Token expirou/foi trocado no servidor: volta para a tela de acesso. */
  private handle(err: Error & { status?: number }, set: (msg: string) => void): void {
    if (err.status === 401 || err.status === 403) {
      this.logout();
      this.loginError.set(err.message);
      return;
    }
    set(err.message);
  }

  loadAll(): void {
    this.loadPhotos(0);
    this.loadPending();
  }

  // ---------- fotos ----------

  loadPhotos(page: number): void {
    this.api.photos(null, page, 24).subscribe({
      next: (p) => {
        this.photos.set(page === 0 ? p.items : [...this.photos(), ...p.items]);
        this.photosMore.set(p.hasMore);
        this.photosPage = page;
      },
      error: (err: Error) => this.uploadMsg.set({ ok: false, text: err.message }),
    });
  }

  morePhotos(): void {
    this.loadPhotos(this.photosPage + 1);
  }

  patch(change: Partial<PhotoForm>): void {
    this.form.update((f) => ({ ...f, ...change }));
  }

  pickFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.file.set(file);
    this.uploadMsg.set(null);
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.preview.set(file ? URL.createObjectURL(file) : null);
  }

  upload(e: Event): void {
    e.preventDefault();
    const file = this.file();
    if (!file || !this.canUpload()) return;
    this.uploading.set(true);
    this.uploadMsg.set(null);
    const form = this.form();
    from(prepareImage(file))
      .pipe(switchMap((blob) => this.api.upload(this.token(), blob, form)))
      .subscribe({
        next: (photo) => {
          this.uploading.set(false);
          this.photos.update((list) => [photo, ...list]);
          this.uploadMsg.set({ ok: true, text: `Foto de ${photo.petName} publicada! 🎉` });
          // mantem servico/especie para enviar a proxima foto mais rapido
          this.form.update((f) => ({ ...f, petName: '', caption: '' }));
          this.file.set(null);
          const old = this.preview();
          if (old) URL.revokeObjectURL(old);
          this.preview.set(null);
        },
        error: (err: Error) => {
          this.uploading.set(false);
          this.handle(err, (text) => this.uploadMsg.set({ ok: false, text }));
        },
      });
  }

  /** Apagar pede confirmacao com um segundo clique (sem janela de confirmacao do navegador). */
  remove(photo: BeautyPhoto): void {
    if (this.confirmDelete() !== photo.id) {
      this.confirmDelete.set(photo.id);
      return;
    }
    this.confirmDelete.set(null);
    this.api.deletePhoto(this.token(), photo.id).subscribe({
      next: () => this.photos.update((list) => list.filter((p) => p.id !== photo.id)),
      error: (err: Error) => this.handle(err, (text) => this.uploadMsg.set({ ok: false, text })),
    });
  }

  // ---------- depoimentos ----------

  loadPending(): void {
    this.api.pending(this.token()).subscribe({
      next: (list) => this.pending.set(list),
      error: (err: Error) => this.handle(err, (text) => this.modError.set(text)),
    });
  }

  approve(t: Testimonial): void {
    this.api.approve(this.token(), t.id).subscribe({
      next: () => this.pending.update((list) => list.filter((x) => x.id !== t.id)),
      error: (err: Error) => this.handle(err, (text) => this.modError.set(text)),
    });
  }

  reject(t: Testimonial): void {
    this.api.deleteTestimonial(this.token(), t.id).subscribe({
      next: () => this.pending.update((list) => list.filter((x) => x.id !== t.id)),
      error: (err: Error) => this.handle(err, (text) => this.modError.set(text)),
    });
  }

  patchManual(change: Partial<{ author: string; petName: string; rating: number; message: string }>): void {
    this.manual.update((m) => ({ ...m, ...change }));
  }

  addManual(e: Event): void {
    e.preventDefault();
    if (!this.manualOk()) return;
    const m = this.manual();
    this.api
      .addTestimonial(this.token(), {
        author: m.author.trim(),
        petName: m.petName.trim() || null,
        rating: m.rating,
        message: m.message.trim(),
        website: '',
      })
      .subscribe({
        next: () => {
          this.manual.set({ author: '', petName: '', rating: 5, message: '' });
          this.manualMsg.set('Depoimento publicado!');
        },
        error: (err: Error) => this.handle(err, (text) => this.manualMsg.set(text)),
      });
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
