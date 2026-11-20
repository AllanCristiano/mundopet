# MundoPet — app Android (Flutter)

Mesmo conteúdo e visual do site, em abas: **Início**, **Rações**, **Beleza** e **Pets**.

```
lib/
  app.dart            abas, AppScope (servicos, configuracao do site, carrinho, tema)
  core/               cliente da API (retentativa so em falha transitoria), tema (cores do site), formatos BR, widgets
  home/               tela inicial (le /api/site — o que o dono edita em /gestao)
  shop/               loja de racoes, carrinho, CEP, taxa de entrega por km, pedido no WhatsApp
  beauty/             galeria do Espaco Beleza e depoimentos
  pets/               cadastro de pets
```

- Testes: `flutter analyze && flutter test --coverage` (unidade + falhas com `MockClient`; cobertura ≥ 80%).
- APK: `docker compose --profile mobile run --rm flutter-apk` na raiz (gera `dist/mundopet.apk`).
- API: `--dart-define=API_URL=http://IP:8088` (padrão `http://10.0.2.2:8088`, o host visto pelo emulador).
