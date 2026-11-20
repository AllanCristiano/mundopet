import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { API_URL, PetsService, toUserMessage } from './pets.service';
import { HttpErrorResponse } from '@angular/common/http';

describe('PetsService', () => {
  let service: PetsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PetsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista pets com paginacao', () => {
    service.list(1, 5).subscribe((pets) => expect(pets.length).toBe(1));
    const req = http.expectOne((r) => r.url === API_URL);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('5');
    req.flush([{ id: '1', name: 'Rex' }]);
  });

  it('tenta de novo em 503 e recupera', fakeAsync(() => {
    let result: unknown[] | undefined;
    service.list().subscribe((p) => (result = p));
    http.expectOne((r) => r.url === API_URL).flush('', { status: 503, statusText: 'x' });
    tick(300);
    http.expectOne((r) => r.url === API_URL).flush([]);
    expect(result).toEqual([]);
  }));

  it('falha com mensagem amigavel apos esgotar tentativas', fakeAsync(() => {
    let error: Error | undefined;
    service.list().subscribe({ error: (e) => (error = e) });
    http.expectOne((r) => r.url === API_URL).error(new ProgressEvent('network'));
    tick(300);
    http.expectOne((r) => r.url === API_URL).error(new ProgressEvent('network'));
    tick(600);
    http.expectOne((r) => r.url === API_URL).error(new ProgressEvent('network'));
    expect(error?.message).toBe('Sem conexao com o servidor.');
  }));

  it('nao repete em 429 (respeita o rate limit)', () => {
    let error: Error | undefined;
    service.list().subscribe({ error: (e) => (error = e) });
    http.expectOne((r) => r.url === API_URL).flush('', { status: 429, statusText: 'x' });
    expect(error?.message).toContain('Muitas requisicoes');
  });

  it('create propaga erro de validacao', () => {
    let error: Error | undefined;
    service.create({ name: '', species: 'gato' }).subscribe({ error: (e) => (error = e) });
    http.expectOne(API_URL).flush({}, { status: 400, statusText: 'Bad Request' });
    expect(error?.message).toBe('Dados invalidos.');
  });

  it('upload de foto envia multipart', () => {
    service.uploadPhoto('1', new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })).subscribe();
    const req = http.expectOne(`${API_URL}/1/photo`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body instanceof FormData).toBeTrue();
    req.flush({});
  });

  it('upload de foto converte erro', () => {
    let error: Error | undefined;
    service.uploadPhoto('1', new File([], 'a.png')).subscribe({ error: (e) => (error = e) });
    http.expectOne(`${API_URL}/1/photo`).flush('', { status: 413, statusText: 'x' });
    expect(error?.message).toBe('Arquivo muito grande.');
  });

  it('mapeia todos os status conhecidos', () => {
    const msg = (status: number) => toUserMessage(new HttpErrorResponse({ status }));
    expect(msg(404)).toContain('nao encontrado');
    expect(msg(503)).toContain('indisponivel');
    expect(msg(500)).toBe('Erro inesperado.');
    expect(service.photoUrl('9')).toBe(`${API_URL}/9/photo`);
  });
});
