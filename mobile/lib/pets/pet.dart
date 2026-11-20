class Pet {
  const Pet({
    required this.id,
    required this.name,
    required this.species,
    this.breed,
    this.photoKey,
  });

  final String id;
  final String name;
  final String species;
  final String? breed;
  final String? photoKey;

  factory Pet.fromJson(Map<String, dynamic> json) => Pet(
        id: json['id'] as String,
        name: json['name'] as String,
        species: json['species'] as String,
        breed: json['breed'] as String?,
        photoKey: json['photoKey'] as String?,
      );
}
