import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./landing/landing-page').then((m) => m.LandingPage), title: 'MundoPet' },
  { path: 'racoes', loadComponent: () => import('./catalog/catalog-page').then((m) => m.CatalogPage), title: 'MundoPet · Rações' },
  { path: 'pets', loadComponent: () => import('./pets/pets-page').then((m) => m.PetsPage), title: 'MundoPet · Pets' },
  { path: '**', redirectTo: '' },
];
