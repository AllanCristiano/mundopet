import 'package:flutter/material.dart';

import 'pet.dart';
import 'pets_api.dart';

class PetsPage extends StatefulWidget {
  const PetsPage({super.key, required this.api});

  final PetsApi api;

  @override
  State<PetsPage> createState() => _PetsPageState();
}

class _PetsPageState extends State<PetsPage> {
  List<Pet> _pets = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final pets = await widget.api.list();
      if (!mounted) return;
      setState(() => _pets = pets);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openCreate() async {
    final name = TextEditingController();
    final species = TextEditingController();
    final created = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Novo pet'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(key: const Key('name'), controller: name, decoration: const InputDecoration(labelText: 'Nome')),
          TextField(key: const Key('species'), controller: species, decoration: const InputDecoration(labelText: 'Especie')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Salvar')),
        ],
      ),
    );
    if (created != true || name.text.trim().isEmpty || species.text.trim().isEmpty) return;
    try {
      final pet = await widget.api.create(name: name.text.trim(), species: species.text.trim());
      if (!mounted) return;
      setState(() => _pets = [pet, ..._pets]);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('MundoPet')),
      floatingActionButton: FloatingActionButton(
        onPressed: _openCreate,
        tooltip: 'Novo pet',
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(onRefresh: _load, child: _body()),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return ListView(children: [
        Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            Text(_error!, key: const Key('error')),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('Tentar novamente')),
          ]),
        ),
      ]);
    }
    if (_pets.isEmpty) {
      return ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('Nenhum pet cadastrado.'))]);
    }
    return ListView.builder(
      itemCount: _pets.length,
      itemBuilder: (_, i) {
        final pet = _pets[i];
        return ListTile(
          leading: pet.photoKey == null
              ? const CircleAvatar(child: Icon(Icons.pets))
              : CircleAvatar(backgroundImage: NetworkImage(widget.api.photoUrl(pet))),
          title: Text(pet.name),
          subtitle: Text([pet.species, if (pet.breed != null) pet.breed!].join(' - ')),
        );
      },
    );
  }
}
