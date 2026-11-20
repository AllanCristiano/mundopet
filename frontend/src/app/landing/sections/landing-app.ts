import { Component, OnInit, computed, inject } from '@angular/core';

import { APK_URL, AppDownloadService } from '../../core/app-download.service';
import { SiteConfigService } from '../../core/site-config';
import { RevealDirective } from '../motion/reveal.directive';
import { ScrollProgressDirective } from '../motion/scroll-progress.directive';

@Component({
  selector: 'app-landing-app',
  imports: [RevealDirective, ScrollProgressDirective],
  templateUrl: './landing-app.html',
  styleUrl: './landing-app.scss',
})
export class LandingApp implements OnInit {
  readonly download = inject(AppDownloadService);
  readonly apkUrl = APK_URL;

  private readonly site = inject(SiteConfigService);

  /** Titulo e numeros da tela inicial do app (os mesmos que o dono edita na gestao). */
  readonly hero = computed(() => this.site.settings().hero);
  readonly stats = computed(() =>
    this.site
      .settings()
      .stats.slice(0, 4)
      .map((s) => ({ ...s, value: s.value.toLocaleString('pt-BR', { maximumFractionDigits: s.decimals }) })),
  );

  /** Itens ficticios so para ilustrar as telas do app no mockup. */
  readonly mockFoods = [
    { brand: 'BOSQUE NATURAL', name: 'Cães Adultos 15 kg', price: 'R$ 329,90', color: '#4f9a5b' },
    { brand: 'CAMPEÃO FORTE', name: 'Cães Adultos 20 kg', price: 'R$ 169,90', color: '#c0392b' },
  ];

  readonly mockGallery = [
    { name: 'Thor', emoji: '🐶', hue: 38 },
    { name: 'Luna', emoji: '🐱', hue: 330 },
    { name: 'Bob', emoji: '🐕', hue: 160 },
    { name: 'Mel', emoji: '🐩', hue: 220 },
  ];

  readonly tabs = [
    { icon: '⌂', label: 'Início' },
    { icon: '🛍', label: 'Rações' },
    { icon: '✦', label: 'Beleza' },
    { icon: '🐾', label: 'Pets' },
  ];

  /** O que o app faz (mesmas areas do site). */
  readonly features = [
    { icon: '🛍', title: 'Loja de rações', text: 'Monte o pedido, veja a taxa de entrega pelo CEP e envie pelo WhatsApp.' },
    { icon: '✦', title: 'Espaço Beleza', text: 'Fotos do spa feitas pela clínica e o seu depoimento em um toque.' },
    { icon: '⏱', title: 'Atendimento', text: 'Horários, clínica 24h, como chegar e WhatsApp sempre à mão.' },
    { icon: '🐾', title: 'Seus pets', text: 'Cadastre seus amigos em segundos.' },
  ];

  readonly steps = [
    'Toque em “Baixar para Android”.',
    'Se o celular pedir, permita instalar apps desta fonte.',
    'Abra o MundoPet e faça o seu primeiro pedido.',
  ];

  readonly androidLabel = computed(() => {
    switch (this.download.state()) {
      case 'checking':
        return 'Verificando…';
      case 'available': {
        const mb = this.download.sizeMb();
        return mb ? `Baixar para Android · ${mb.toLocaleString('pt-BR')} MB` : 'Baixar para Android';
      }
      default:
        return 'Android: em breve';
    }
  });

  ngOnInit(): void {
    void this.download.check();
  }
}
