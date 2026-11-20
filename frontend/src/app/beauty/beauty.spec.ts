import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LandingBeauty } from '../landing/sections/landing-beauty';
import { ADMIN_HEADER, BEAUTY_API, BeautyApi, beautyError } from './beauty.api';
import { ADMIN_TOKEN_KEY, BeautyAdmin } from './beauty-admin';
import { BeautyPhoto, PhotoPage, Testimonial, TestimonialPage, authorLine, rating, stars } from './beauty.models';
import { BeautyPage, PHOTOS_PAGE } from './beauty-page';
import { fit, prepareImage } from './image-resize';
import { HttpErrorResponse } from '@angular/common/http';

export function makePhoto(over: Partial<BeautyPhoto> = {}): BeautyPhoto {
  const id = over.id ?? 'ph1';
  return {
    id, petName: 'Thor', species: 'CAO', service: 'TOSA', caption: 'Tosa bebê', width: 800, height: 600,
    createdAt: '2026-11-20T10:00:00Z', thumbUrl: `/api/beauty/photos/${id}/thumb`, fullUrl: `/api/beauty/photos/${id}/full`, ...over,
  };
}

export function makeTestimonial(over: Partial<Testimonial> = {}): Testimonial {
  return { id: 't1', author: 'Ana', petName: 'Mel', rating: 5, message: 'A Mel voltou linda e cheirosa!', status: 'APPROVED',
    createdAt: '2026-11-20T10:00:00Z', ...over };
}

const photoPage = (items: BeautyPhoto[], hasMore = false): PhotoPage => ({ items, page: 0, size: PHOTOS_PAGE, hasMore });
const tPage = (items: Testimonial[], hasMore = false, average = 4.8, count = items.length): TestimonialPage =>
  ({ items, page: 0, size: 9, hasMore, summary: { average, count } });

/** Gera uma imagem PNG real no navegador (para testar o redimensionamento). */
function pngBlob(w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.fillRect(0, 0, w, h);
  return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
}

describe('Espaco Beleza', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.match('/api/admin/mode').forEach((r) => r.flush({ enabled: true, demo: false }));
    http.match('/api/admin/session').forEach((r) => r.flush(null));
    http.verify();
    document.body.style.overflow = '';
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  });

  // ---------------- helpers ----------------

  describe('helpers', () => {
    it('estrelas, nota e autor', () => {
      expect(stars(4)).toBe('★★★★☆');
      expect(stars(9)).toBe('★★★★★');
      expect(stars(-1)).toBe('☆☆☆☆☆');
      expect(rating(4.75)).toBe('4,8');
      expect(authorLine({ author: 'Ana', petName: 'Mel' })).toBe('Ana · com Mel');
      expect(authorLine({ author: 'Ana', petName: null })).toBe('Ana');
    });

    it('erro usa a mensagem do servidor quando existe', () => {
      const withDetail = beautyError(new HttpErrorResponse({ status: 400, error: { detail: 'Formato não suportado' } }));
      expect(withDetail.message).toBe('Formato não suportado');
      expect((withDetail as Error & { status: number }).status).toBe(400);
      expect(beautyError(new HttpErrorResponse({ status: 401 })).message).toBe('Token inválido');
      expect(beautyError(new HttpErrorResponse({ status: 503, error: 'x' })).message).toContain('indisponivel');
    });

    it('fit reduz mantendo proporcao e nunca amplia', () => {
      expect(fit(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
      expect(fit(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
      expect(fit(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    });

    it('prepareImage gera JPEG reduzido; arquivo que nao e imagem volta igual', async () => {
      const out = await prepareImage(await pngBlob(3000, 1500), 1000);
      expect(out.type).toBe('image/jpeg');
      const bmp = await createImageBitmap(out);
      expect([bmp.width, bmp.height]).toEqual([1000, 500]);
      const text = new Blob(['nao sou imagem'], { type: 'text/plain' });
      expect(await prepareImage(text)).toBe(text);
    });

    it('api manda o token no header das rotas da clinica', () => {
      const api = TestBed.inject(BeautyApi);
      api.check('tok').subscribe();
      expect(http.expectOne(`${BEAUTY_API}/admin/check`).request.headers.get(ADMIN_HEADER)).toBe('tok');
      api.deletePhoto('tok', 'p1').subscribe();
      const del = http.expectOne(`${BEAUTY_API}/admin/photos/p1`);
      expect(del.request.method).toBe('DELETE');
      del.flush(null);
    });
  });

  // ---------------- /beleza ----------------

  describe('BeautyPage', () => {
    function render() {
      const f = TestBed.createComponent(BeautyPage);
      f.detectChanges();
      return { f, el: f.nativeElement as HTMLElement, c: f.componentInstance };
    }

    const photosReq = (service?: string, page = 0) =>
      http.expectOne((r) => r.url === `${BEAUTY_API}/photos` && String(r.params.get('page')) === String(page) &&
        (service ? r.params.get('service') === service : !r.params.has('service')));
    const testimonialsReq = (page = 0) =>
      http.expectOne((r) => r.url === `${BEAUTY_API}/testimonials` && String(r.params.get('page')) === String(page));

    it('mostra galeria, nota media e depoimentos', () => {
      const { f, el } = render();
      expect(el.querySelectorAll('.skeleton').length).toBe(4);
      photosReq().flush(photoPage([makePhoto(), makePhoto({ id: 'ph2', petName: 'Luna', service: 'BANHO' })], true));
      testimonialsReq().flush(tPage([makeTestimonial()], true, 4.8, 21));
      f.detectChanges();

      expect(el.querySelectorAll('.grid .card:not(.skeleton)').length).toBe(2);
      expect(el.querySelector<HTMLImageElement>('.card img')!.getAttribute('src')).toBe('/api/beauty/photos/ph1/thumb');
      expect(el.querySelector('.card .tag')!.textContent).toContain('Tosa');
      expect(el.querySelector('.score')!.textContent).toContain('4,8');
      expect(el.querySelector('.score')!.textContent).toContain('21 depoimentos');
      expect(el.querySelector('.quotes blockquote')!.textContent).toContain('A Mel voltou');
      expect(el.querySelector('.quotes cite')!.textContent).toContain('Ana · com Mel');

      // paginas seguintes
      (el.querySelector('.gallery .more') as HTMLButtonElement).click();
      photosReq(undefined, 1).flush({ ...photoPage([makePhoto({ id: 'ph3' })]), page: 1 });
      (el.querySelector('.voices .more') as HTMLButtonElement).click();
      testimonialsReq(1).flush({ ...tPage([makeTestimonial({ id: 't2' })]), page: 1 });
      f.detectChanges();
      expect(el.querySelectorAll('.grid .card').length).toBe(3);
      expect(el.querySelectorAll('.quotes li').length).toBe(2);
      expect(el.querySelector('.gallery .more')).toBeNull();
    });

    it('filtro por servico recarrega e ignora resposta atrasada do filtro anterior', () => {
      const { f, el, c } = render();
      testimonialsReq().flush(tPage([]));
      c.pick('TOSA');
      const stale = photosReq();
      photosReq('TOSA').flush(photoPage([]));
      stale.flush(photoPage([makePhoto()]));
      f.detectChanges();
      expect(c.photos().length).toBe(0);
      expect(el.querySelector('.empty')!.textContent).toContain('Nenhuma foto deste serviço');
      expect(el.querySelector('.chips .on')!.textContent).toContain('Tosa');
      c.pick('TOSA'); // mesmo filtro: nao busca de novo
      expect(el.querySelector('.first')!.textContent).toContain('primeiro');

      const chips = el.querySelectorAll<HTMLButtonElement>('.chips button');
      chips[0].click();
      photosReq().flush(photoPage([]));
      f.detectChanges();
      expect(el.querySelector('.empty')!.textContent).toContain('em breve');
    });

    it('falha na API mostra erro com "tentar de novo"', () => {
      const { f, el } = render();
      photosReq().flush('', { status: 500, statusText: 'x' });
      testimonialsReq().flush('', { status: 404, statusText: 'x' });
      f.detectChanges();
      const errors = el.querySelectorAll<HTMLElement>('.error');
      expect(errors.length).toBe(2);
      errors[0].querySelector('button')!.click();
      errors[1].querySelector('button')!.click();
      photosReq().flush(photoPage([makePhoto()]));
      testimonialsReq().flush(tPage([]));
      f.detectChanges();
      expect(el.querySelectorAll('.error').length).toBe(0);
    });

    it('lightbox: abre, navega por botoes, teclado e arrastar; fecha e devolve o foco', fakeAsync(() => {
      const { f, el, c } = render();
      photosReq().flush(photoPage([makePhoto(), makePhoto({ id: 'ph2', petName: 'Luna', caption: null })]));
      testimonialsReq().flush(tPage([]));
      f.detectChanges();

      const opener = el.querySelector<HTMLButtonElement>('.card button')!;
      opener.focus();
      opener.click();
      f.detectChanges();
      flushMicrotasks();
      const box = () => el.querySelector('.box');
      expect(box()!.querySelector('strong')!.textContent).toBe('Thor');
      expect(box()!.querySelector<HTMLImageElement>('img')!.getAttribute('src')).toBe('/api/beauty/photos/ph1/full');
      expect(box()!.querySelector('.cap')!.textContent).toContain('Tosa bebê');
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.activeElement).toBe(box()!.querySelector('.x'));

      box()!.querySelector<HTMLButtonElement>('.next')!.click();
      f.detectChanges();
      expect(box()!.querySelector('strong')!.textContent).toBe('Luna');
      expect(box()!.querySelector('.cap')).toBeNull();
      expect(box()!.querySelector('.pos')!.textContent).toContain('2 / 2');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      f.detectChanges();
      expect(c.open()).toBe(0);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      expect(c.open()).toBe(1);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(c.open()).toBe(1);
      box()!.querySelector<HTMLButtonElement>('.prev')!.click();
      expect(c.open()).toBe(0);

      // arrastar para a esquerda = proxima; arrasto curto nao troca
      f.detectChanges();
      const fig = box()!;
      fig.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300 }));
      fig.dispatchEvent(new PointerEvent('pointerup', { clientX: 200 }));
      expect(c.open()).toBe(1);
      fig.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300 }));
      fig.dispatchEvent(new PointerEvent('pointerup', { clientX: 280 }));
      expect(c.open()).toBe(1);
      fig.dispatchEvent(new PointerEvent('pointerup', { clientX: 0 }));
      expect(c.open()).toBe(1);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      f.detectChanges();
      flushMicrotasks();
      expect(box()).toBeNull();
      expect(document.body.style.overflow).toBe('');
      expect(document.activeElement).toBe(opener);

      // fundo escuro tambem fecha; teclas sem lightbox aberto nao fazem nada
      opener.click();
      f.detectChanges();
      flushMicrotasks();
      el.querySelector<HTMLElement>('.shade')!.click();
      f.detectChanges();
      flushMicrotasks();
      expect(c.open()).toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(c.open()).toBeNull();
    }));

    it('formulario de depoimento: valida, envia, mostra agradecimento e erro do servidor', () => {
      const { f, el } = render();
      photosReq().flush(photoPage([]));
      testimonialsReq().flush(tPage([]));
      f.detectChanges();
      const form = el.querySelector('app-testimonial-form')!;
      const type = (sel: string, v: string) => {
        const i = form.querySelector<HTMLInputElement>(sel)!;
        i.value = v;
        i.dispatchEvent(new Event('input'));
        f.detectChanges();
      };
      const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
      expect(submit.disabled).toBeTrue();

      type('input[name=author]', 'Ana');
      type('textarea', 'curto');
      expect(submit.disabled).toBeTrue();
      type('textarea', 'A Mel voltou cheirosa demais!');
      type('input[name=petName]', ' Mel ');
      const star3 = form.querySelectorAll<HTMLInputElement>('.stars input')[2];
      star3.dispatchEvent(new Event('change'));
      f.detectChanges();
      expect(form.querySelectorAll('.stars label.on').length).toBe(3);
      expect(form.querySelector('.count')!.classList).toContain('ok');
      expect(submit.disabled).toBeFalse();

      // erro do servidor (ex.: limite) aparece e permite tentar de novo
      submit.click();
      f.detectChanges();
      expect(submit.textContent).toContain('Enviando');
      http.expectOne(`${BEAUTY_API}/testimonials`).flush({ detail: 'Tente mais tarde.' }, { status: 429, statusText: 'x' });
      f.detectChanges();
      expect(form.querySelector('.error')!.textContent).toContain('Tente mais tarde');

      submit.click();
      const req = http.expectOne(`${BEAUTY_API}/testimonials`);
      expect(req.request.body).toEqual({ author: 'Ana', petName: 'Mel', rating: 3, message: 'A Mel voltou cheirosa demais!', website: '' });
      req.flush({ status: 'PENDING', message: 'Obrigado! Aparece depois da aprovação.' });
      f.detectChanges();
      expect(form.querySelector('.done')!.textContent).toContain('depois da aprovação');

      form.querySelector<HTMLButtonElement>('.done button')!.click();
      f.detectChanges();
      expect(form.querySelector('form')).not.toBeNull();
      expect(form.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    });
  });

  // ---------------- /beleza/admin ----------------

  describe('BeautyAdmin', () => {
    function render(): { f: ComponentFixture<BeautyAdmin>; el: HTMLElement; c: BeautyAdmin } {
      const f = TestBed.createComponent(BeautyAdmin);
      f.detectChanges();
      return { f, el: f.nativeElement as HTMLElement, c: f.componentInstance };
    }

    function loginAs(f: ComponentFixture<BeautyAdmin>, el: HTMLElement, user = 'dono', pass = 'senha-certa') {
      http.match('/api/admin/mode').forEach((r) => r.flush({ enabled: true, demo: false }));
      f.detectChanges();
      for (const [name, value] of [['username', user], ['password', pass]]) {
        const input = el.querySelector<HTMLInputElement>(`input[name=${name}]`)!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      }
      f.detectChanges();
      el.querySelector<HTMLFormElement>('form.login')!.dispatchEvent(new Event('submit'));
      f.detectChanges();
      return http.expectOne('/api/admin/login');
    }

    function flushInitial(photos: BeautyPhoto[] = [], pending: Testimonial[] = []) {
      http.expectOne((r) => r.url === `${BEAUTY_API}/photos`).flush(photoPage(photos));
      http.expectOne(`${BEAUTY_API}/admin/testimonials`).flush(pending);
    }

    it('login errado mostra erro; certo entra, guarda na sessao e sai', () => {
      const { f, el } = render();
      expect(el.querySelector('form.login')).not.toBeNull();
      loginAs(f, el, 'dono', 'errada').flush({ detail: 'Login ou senha inválidos' }, { status: 401, statusText: 'x' });
      f.detectChanges();
      expect(el.querySelector('.login .error')!.textContent).toContain('Login ou senha inválidos');

      const ok = loginAs(f, el);
      expect(ok.request.body).toEqual({ username: 'dono', password: 'senha-certa' });
      ok.flush({ token: 'tok-sessao', username: 'dono', demo: false, expiresInSeconds: 28800 });
      flushInitial();
      f.detectChanges();
      expect(sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBe('tok-sessao');
      expect(el.querySelector('.title')).not.toBeNull();
      expect(el.querySelector('.thumbs .none')).not.toBeNull();

      el.querySelector<HTMLButtonElement>('.out')!.click();
      f.detectChanges();
      const bye = http.expectOne('/api/admin/session');
      expect(bye.request.method).toBe('DELETE');
      expect(bye.request.headers.get(ADMIN_HEADER)).toBe('tok-sessao');
      bye.flush(null);
      expect(sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
      expect(el.querySelector('form.login')).not.toBeNull();
    });

    it('envia foto otimizada, lista e apaga com confirmacao', async () => {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, 'tok');
      const { f, el, c } = render();
      flushInitial([makePhoto({ id: 'old', petName: 'Bob' })]);
      f.detectChanges();
      const submit = () => el.querySelector<HTMLButtonElement>('form.upload button[type=submit]')!;
      expect(submit().disabled).toBeTrue();

      const file = new File([await pngBlob(2400, 1200)], 'foto.png', { type: 'image/png' });
      const input = el.querySelector<HTMLInputElement>('.drop input')!;
      Object.defineProperty(input, 'files', { value: [file] });
      input.dispatchEvent(new Event('change'));
      const name = el.querySelector<HTMLInputElement>('.fields input')!;
      name.value = 'Thor';
      name.dispatchEvent(new Event('input'));
      const selects = el.querySelectorAll<HTMLSelectElement>('.fields select');
      selects[0].value = 'GATO';
      selects[0].dispatchEvent(new Event('change'));
      selects[1].value = 'SPA';
      selects[1].dispatchEvent(new Event('change'));
      f.detectChanges();
      expect(el.querySelector('.drop img')).not.toBeNull();
      expect(submit().disabled).toBeFalse();

      el.querySelector<HTMLFormElement>('form.upload')!.dispatchEvent(new Event('submit'));
      expect(c.uploading()).toBeTrue();
      await new Promise((r) => setTimeout(r, 300)); // redimensionamento no canvas
      const req = http.expectOne(`${BEAUTY_API}/admin/photos`);
      const body = req.request.body as FormData;
      expect(req.request.headers.get(ADMIN_HEADER)).toBe('tok');
      expect(body.get('petName')).toBe('Thor');
      expect(body.get('species')).toBe('GATO');
      expect(body.get('service')).toBe('SPA');
      expect((body.get('file') as File).type).toBe('image/jpeg');
      req.flush(makePhoto({ id: 'new', petName: 'Thor' }));
      f.detectChanges();
      expect(el.querySelector('form.upload .ok')!.textContent).toContain('Thor');
      expect(c.photos().map((p) => p.id)).toEqual(['new', 'old']);
      expect(c.form().service).toBe('SPA'); // mantem para a proxima
      expect(c.form().petName).toBe('');

      // apagar: primeiro clique pede confirmacao
      const del = () => el.querySelectorAll<HTMLButtonElement>('.thumbs .del')[1];
      del().click();
      f.detectChanges();
      expect(del().textContent).toContain('Confirmar');
      del().click();
      http.expectOne(`${BEAUTY_API}/admin/photos/old`).flush(null);
      f.detectChanges();
      expect(c.photos().map((p) => p.id)).toEqual(['new']);
    });

    it('erro no envio aparece; token expirado volta para o login', async () => {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, 'tok');
      const { f, el, c } = render();
      flushInitial([], []);
      c.file.set(new File(['x'], 'a.txt', { type: 'text/plain' }));
      c.patch({ petName: 'Rex' });
      c.upload(new Event('submit'));
      await new Promise((r) => setTimeout(r, 400)); // redimensionamento no navegador e assincrono
      http.expectOne(`${BEAUTY_API}/admin/photos`).flush({ detail: 'Formato não suportado' }, { status: 400, statusText: 'x' });
      f.detectChanges();
      expect(el.querySelector('form.upload .error')!.textContent).toContain('Formato não suportado');

      c.remove(makePhoto({ id: 'z' }));
      c.remove(makePhoto({ id: 'z' }));
      http.expectOne(`${BEAUTY_API}/admin/photos/z`).flush({ detail: 'Token inválido' }, { status: 401, statusText: 'x' });
      f.detectChanges();
      expect(el.querySelector('form.login .error')!.textContent).toContain('Token inválido');
      expect(sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
    });

    it('modera depoimentos e cadastra um ja aprovado', () => {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, 'tok');
      const { f, el, c } = render();
      flushInitial([makePhoto()], [makeTestimonial({ id: 'a', status: 'PENDING' }), makeTestimonial({ id: 'b', status: 'PENDING' })]);
      f.detectChanges();
      expect(el.querySelector('.tabs .n.alert')!.textContent).toContain('2');
      el.querySelectorAll<HTMLButtonElement>('.tabs button')[1].click();
      f.detectChanges();

      el.querySelector<HTMLButtonElement>('.pending .btn--gold')!.click();
      const approve = http.expectOne(`${BEAUTY_API}/admin/testimonials/a/approve`);
      expect(approve.request.method).toBe('POST');
      approve.flush(null);
      f.detectChanges();
      el.querySelector<HTMLButtonElement>('.pending .actions .btn:not(.btn--gold)')!.click();
      http.expectOne(`${BEAUTY_API}/admin/testimonials/b`).flush(null);
      f.detectChanges();
      expect(el.querySelector('.pending .none')).not.toBeNull();

      c.approve(makeTestimonial({ id: 'x' }));
      http.expectOne(`${BEAUTY_API}/admin/testimonials/x/approve`).flush({ detail: 'Depoimento pendente não encontrado' }, { status: 404, statusText: 'x' });
      f.detectChanges();
      expect(el.querySelector('section.card .error')!.textContent).toContain('não encontrado');

      const form = el.querySelector('form.manual')!;
      const inputs = form.querySelectorAll<HTMLInputElement>('input');
      inputs[0].value = 'Carlos';
      inputs[0].dispatchEvent(new Event('input'));
      inputs[1].value = 'Bob';
      inputs[1].dispatchEvent(new Event('input'));
      const select = form.querySelector<HTMLSelectElement>('select')!;
      select.value = '4';
      select.dispatchEvent(new Event('change'));
      const text = form.querySelector<HTMLTextAreaElement>('textarea')!;
      text.value = 'Elogio recebido no WhatsApp';
      text.dispatchEvent(new Event('input'));
      f.detectChanges();
      form.dispatchEvent(new Event('submit'));
      const add = http.expectOne(`${BEAUTY_API}/admin/testimonials`);
      expect(add.request.body).toEqual({ author: 'Carlos', petName: 'Bob', rating: 4, message: 'Elogio recebido no WhatsApp', website: '' });
      add.flush(makeTestimonial());
      f.detectChanges();
      expect(form.querySelector('.ok')!.textContent).toContain('publicado');
      expect(c.manualOk()).toBeFalse();
    });
  });

  // ---------------- vitrine na landing ----------------

  describe('LandingBeauty', () => {
    function render() {
      const f = TestBed.createComponent(LandingBeauty);
      f.detectChanges();
      return { f, el: f.nativeElement as HTMLElement };
    }
    const flush = (photos: BeautyPhoto[] | null, t: TestimonialPage | null) => {
      const p = http.expectOne((r) => r.url === `${BEAUTY_API}/photos`);
      if (photos) p.flush(photoPage(photos));
      else p.flush('', { status: 404, statusText: 'x' });
      const q = http.expectOne((r) => r.url === `${BEAUTY_API}/testimonials`);
      if (t) q.flush(t);
      else q.flush('', { status: 404, statusText: 'x' });
    };

    it('mostra polaroids (em loop quando tem 4+), nota e depoimentos', () => {
      const { f, el } = render();
      flush([0, 1, 2, 3].map((i) => makePhoto({ id: 'p' + i })), tPage([makeTestimonial()], false, 4.9, 1));
      f.detectChanges();
      expect(el.querySelectorAll('.track li').length).toBe(8);
      expect(el.querySelector('.track')!.classList).toContain('moving');
      expect(el.querySelectorAll('.track li[aria-hidden=true]').length).toBe(4);
      expect(el.querySelector('.score')!.textContent).toContain('1 depoimento');
      expect(el.querySelector('.quotes blockquote')!.textContent).toContain('A Mel');
      expect(el.querySelector('a.btn')!.getAttribute('href')).toBe('/beleza');
    });

    it('poucas fotos ficam paradas; sem conteudo ou com API fora mostra convite', () => {
      const a = render();
      flush([makePhoto()], tPage([], false, 0, 0));
      a.f.detectChanges();
      expect(a.el.querySelectorAll('.track li').length).toBe(1);
      expect(a.el.querySelector('.track')!.classList).not.toContain('moving');
      expect(a.el.querySelector('.score')).toBeNull();

      const b = render();
      flush(null, null);
      b.f.detectChanges();
      expect(b.el.querySelector('.soon')!.textContent).toContain('Em breve');
      expect(b.el.querySelector('a.btn')).not.toBeNull();
    });
  });
});
