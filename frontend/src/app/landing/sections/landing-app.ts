import { Component, OnInit, computed, inject } from '@angular/core';

import { APK_URL, AppDownloadService } from '../../core/app-download.service';
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

  /** Pets ficticios so para ilustrar a tela do app no mockup. */
  readonly mockPets = [
    { name: 'Thor', info: 'cachorro · golden', hue: 38 },
    { name: 'Luna', info: 'gato · siamês', hue: 330 },
    { name: 'Bob', info: 'cachorro · vira-lata', hue: 160 },
    { name: 'Mel', info: 'cachorro · poodle', hue: 220 },
  ];

  readonly steps = [
    'Toque em “Baixar para Android”.',
    'Se o celular pedir, permita instalar apps desta fonte.',
    'Abra o MundoPet e cadastre o seu pet.',
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
