export interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  birthDate: string | null;
  photoKey: string | null;
  createdAt: string;
}

export interface CreatePet {
  name: string;
  species: string;
  breed?: string | null;
  birthDate?: string | null;
}
