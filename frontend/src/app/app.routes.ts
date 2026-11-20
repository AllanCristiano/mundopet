import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./landing/landing-page').then((m) => m.LandingPage), title: 'MundoPet' },
  { path: 'pets', loadComponent: () => import('./pets/pets-page').then((m) => m.PetsPage), title: 'MundoPet · Pets' },
  { path: '**', redirectTo: '' },
];
