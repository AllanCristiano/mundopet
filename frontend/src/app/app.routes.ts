import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pets/pets-page').then((m) => m.PetsPage) },
  { path: '**', redirectTo: '' },
];
