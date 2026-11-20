import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  it('renderiza o router-outlet', async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });

  it('landing na raiz e painel em /pets, com lazy loading', async () => {
    expect(routes.find((r) => r.path === '')?.loadComponent).toBeDefined();
    expect(routes.find((r) => r.path === 'pets')?.loadComponent).toBeDefined();
    const landing = await routes[0].loadComponent!();
    const pets = await routes[1].loadComponent!();
    expect(landing).toBeTruthy();
    expect(pets).toBeTruthy();
  });
});
