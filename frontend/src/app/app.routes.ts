import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./landing/landing-page').then((m) => m.LandingPage), title: 'MundoPet' },
  { path: 'racoes', loadComponent: () => import('./catalog/catalog-page').then((m) => m.CatalogPage), title: 'MundoPet · Rações' },
  { path: 'beleza', loadComponent: () => import('./beauty/beauty-page').then((m) => m.BeautyPage), title: 'MundoPet · Espaço Beleza' },
  {
    path: 'beleza/admin',
    loadComponent: () => import('./beauty/beauty-admin').then((m) => m.BeautyAdmin),
    title: 'MundoPet · Área da clínica',
  },
  { path: 'gestao', loadComponent: () => import('./admin/site-admin').then((m) => m.SiteAdmin), title: 'MundoPet · Gestão do site' },
  { path: 'pets', loadComponent: () => import('./pets/pets-page').then((m) => m.PetsPage), title: 'MundoPet · Pets' },
  { path: '**', redirectTo: '' },
];
