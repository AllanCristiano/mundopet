import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { Pet } from './pet.model';
import { PetsPage } from './pets-page';
import { PetsService } from './pets.service';

const rex: Pet = {
  id: '1',
  name: 'Rex',
  species: 'cachorro',
  breed: null,
  birthDate: null,
  photoKey: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('PetsPage', () => {
  let api: jasmine.SpyObj<PetsService>;

  function render() {
    const fixture = TestBed.createComponent(PetsPage);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<PetsService>('PetsService', ['list', 'create', 'uploadPhoto', 'photoUrl']);
    api.photoUrl.and.returnValue('/api/pets/1/photo');
    TestBed.configureTestingModule({
      imports: [PetsPage],
      providers: [{ provide: PetsService, useValue: api }],
    });
  });

  it('lista os pets', () => {
    api.list.and.returnValue(of([rex]));
    const el: HTMLElement = render().nativeElement;
    expect(el.textContent).toContain('Rex');
  });

  it('mostra estado vazio', () => {
    api.list.and.returnValue(of([]));
    expect(render().nativeElement.textContent).toContain('Nenhum pet cadastrado');
  });

  it('mostra erro quando a API falha', () => {
    api.list.and.returnValue(throwError(() => new Error('Sem conexao com o servidor.')));
    const el: HTMLElement = render().nativeElement;
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Sem conexao');
  });

  it('nao envia formulario invalido', () => {
    api.list.and.returnValue(of([]));
    const fixture = render();
    fixture.componentInstance.submit();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('cadastra e adiciona no topo da lista', () => {
    api.list.and.returnValue(of([]));
    api.create.and.returnValue(of(rex));
    const fixture = render();
    fixture.componentInstance.form.setValue({ name: 'Rex', species: 'cachorro', breed: '' });
    fixture.componentInstance.submit();
    expect(api.create).toHaveBeenCalledWith({ name: 'Rex', species: 'cachorro', breed: null });
    expect(fixture.componentInstance.pets()[0]).toEqual(rex);
    expect(fixture.componentInstance.saving()).toBeFalse();
  });

  it('mostra erro quando o cadastro falha e libera o botao', () => {
    api.list.and.returnValue(of([]));
    api.create.and.returnValue(throwError(() => new Error('Servico temporariamente indisponivel.')));
    const fixture = render();
    fixture.componentInstance.form.setValue({ name: 'Rex', species: 'cachorro', breed: '' });
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.error()).toContain('indisponivel');
    expect(fixture.componentInstance.saving()).toBeFalse();
  });

  it('atualiza o pet apos upload de foto', () => {
    api.list.and.returnValue(of([rex]));
    api.uploadPhoto.and.returnValue(of({ ...rex, photoKey: 'k' }));
    const fixture = render();
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    fixture.componentInstance.onPhoto(rex, { target: { files: [file] } } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.componentInstance.pets()[0].photoKey).toBe('k');
    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });

  it('mostra erro quando upload falha e ignora selecao vazia', () => {
    api.list.and.returnValue(of([rex]));
    api.uploadPhoto.and.returnValue(throwError(() => new Error('Arquivo muito grande.')));
    const fixture = render();
    fixture.componentInstance.onPhoto(rex, { target: { files: [] } } as unknown as Event);
    expect(api.uploadPhoto).not.toHaveBeenCalled();
    fixture.componentInstance.onPhoto(rex, { target: { files: [new File([], 'a.png')] } } as unknown as Event);
    expect(fixture.componentInstance.error()).toBe('Arquivo muito grande.');
  });
});
