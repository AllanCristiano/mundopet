import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Pet } from './pet.model';
import { PetsService } from './pets.service';

@Component({
  selector: 'app-pets-page',
  imports: [ReactiveFormsModule],
  templateUrl: './pets-page.html',
  styleUrl: './pets-page.scss',
})
export class PetsPage implements OnInit {
  private readonly api = inject(PetsService);
  private readonly fb = inject(FormBuilder);

  readonly pets = signal<Pet[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    species: ['', [Validators.required, Validators.maxLength(50)]],
    breed: ['', Validators.maxLength(100)],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (pets) => {
        this.pets.set(pets);
        this.loading.set(false);
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.loading.set(false);
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const { name, species, breed } = this.form.getRawValue();
    this.api.create({ name, species, breed: breed || null }).subscribe({
      next: (pet) => {
        this.pets.update((list) => [pet, ...list]);
        this.form.reset();
        this.saving.set(false);
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.saving.set(false);
      },
    });
  }

  onPhoto(pet: Pet, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    this.api.uploadPhoto(pet.id, file).subscribe({
      next: (updated) => this.pets.update((list) => list.map((p) => (p.id === updated.id ? updated : p))),
      error: (e: Error) => this.error.set(e.message),
    });
  }

  photoUrl(pet: Pet): string {
    return `${this.api.photoUrl(pet.id)}?v=${encodeURIComponent(pet.photoKey ?? '')}`;
  }
}
