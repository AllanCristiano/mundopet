import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, retry, throwError, timer } from 'rxjs';

import { toUserMessage } from '../pets/pets.service';
import { BeautyPhoto, BeautyService, NewTestimonial, PhotoForm, PhotoPage, Testimonial, TestimonialPage } from './beauty.models';

export const BEAUTY_API = '/api/beauty';
export const ADMIN_HEADER = 'X-Admin-Token';

/** Usa a mensagem do servidor (ProblemDetail.detail, em portugues) quando houver. */
export function beautyError(err: HttpErrorResponse): Error {
  const detail = typeof err.error === 'object' && err.error && typeof err.error.detail === 'string' ? err.error.detail : '';
  if (err.status === 401) return Object.assign(new Error(detail || 'Token inválido'), { status: 401 });
  return Object.assign(new Error(detail || toUserMessage(err)), { status: err.status });
}

const fail = (err: HttpErrorResponse) => throwError(() => beautyError(err));

/** Leituras repetem em falha transitoria (rede/503) com backoff. */
function transientRetry<T>() {
  return retry<T>({
    count: 2,
    delay: (err: HttpErrorResponse, attempt: number) =>
      err.status === 0 || err.status === 503 ? timer(attempt * 400) : throwError(() => err),
  });
}

@Injectable({ providedIn: 'root' })
export class BeautyApi {
  private readonly http = inject(HttpClient);

  photos(service: BeautyService | null, page = 0, size = 24): Observable<PhotoPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (service) params = params.set('service', service);
    return this.http.get<PhotoPage>(`${BEAUTY_API}/photos`, { params }).pipe(transientRetry(), catchError(fail));
  }

  testimonials(page = 0, size = 12): Observable<TestimonialPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<TestimonialPage>(`${BEAUTY_API}/testimonials`, { params }).pipe(transientRetry(), catchError(fail));
  }

  submit(t: NewTestimonial): Observable<string> {
    return this.http
      .post<{ message: string }>(`${BEAUTY_API}/testimonials`, t)
      .pipe(map((r) => r.message), catchError(fail));
  }

  // ---------------- Area da clinica ----------------

  private auth(token: string) {
    return { headers: new HttpHeaders({ [ADMIN_HEADER]: token }) };
  }

  check(token: string): Observable<void> {
    return this.http.get<void>(`${BEAUTY_API}/admin/check`, this.auth(token)).pipe(catchError(fail));
  }

  upload(token: string, image: Blob, form: PhotoForm): Observable<BeautyPhoto> {
    const body = new FormData();
    body.append('file', image, 'foto.jpg');
    body.append('petName', form.petName.trim());
    body.append('species', form.species);
    body.append('service', form.service);
    body.append('caption', form.caption.trim());
    return this.http.post<BeautyPhoto>(`${BEAUTY_API}/admin/photos`, body, this.auth(token)).pipe(catchError(fail));
  }

  deletePhoto(token: string, id: string): Observable<void> {
    return this.http.delete<void>(`${BEAUTY_API}/admin/photos/${id}`, this.auth(token)).pipe(catchError(fail));
  }

  pending(token: string): Observable<Testimonial[]> {
    return this.http.get<Testimonial[]>(`${BEAUTY_API}/admin/testimonials`, this.auth(token)).pipe(catchError(fail));
  }

  approve(token: string, id: string): Observable<void> {
    return this.http.post<void>(`${BEAUTY_API}/admin/testimonials/${id}/approve`, null, this.auth(token)).pipe(catchError(fail));
  }

  deleteTestimonial(token: string, id: string): Observable<void> {
    return this.http.delete<void>(`${BEAUTY_API}/admin/testimonials/${id}`, this.auth(token)).pipe(catchError(fail));
  }

  addTestimonial(token: string, t: NewTestimonial): Observable<Testimonial> {
    return this.http.post<Testimonial>(`${BEAUTY_API}/admin/testimonials`, t, this.auth(token)).pipe(catchError(fail));
  }
}
