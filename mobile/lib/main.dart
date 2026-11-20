import 'package:flutter/material.dart';

import 'pets/pets_api.dart';
import 'pets/pets_page.dart';

void main() {
  runApp(MundoPetApp(api: PetsApi()));
}

class MundoPetApp extends StatelessWidget {
  const MundoPetApp({super.key, required this.api});

  final PetsApi api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MundoPet',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2E7D32), useMaterial3: true),
      home: PetsPage(api: api),
    );
  }
}
