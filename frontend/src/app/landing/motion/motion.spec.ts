import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CountUpDirective } from './count-up.directive';
import { clamp01, prefersReducedMotion } from './motion';
import { RevealDirective } from './reveal.directive';
import { ScrollProgressDirective } from './scroll-progress.directive';

/** IntersectionObserver falso: permite disparar a entrada na tela manualmente. */
class FakeIO {
  static all: FakeIO[] = [];
  static get last() {
    return FakeIO.all[FakeIO.all.length - 1];
  }
  disconnected = false;
  constructor(public cb: IntersectionObserverCallback) {
    FakeIO.all.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
  enter(visible = true) {
    this.cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

function setReducedMotion(reduce: boolean) {
  spyOn(window, 'matchMedia').and.returnValue({ matches: reduce } as MediaQueryList);
}

@Component({
  imports: [RevealDirective, ScrollProgressDirective, CountUpDirective],
  template: `
    <p id="r" [appReveal]="delay()">oi</p>
    <div id="pin" appScrollProgress mode="pin" [steps]="4"></div>
    <div id="view" appScrollProgress mode="view"></div>
    <span id="n" [appCountUp]="1500" [decimals]="1" prefix="+" suffix="h" [duration]="10"></span>
  `,
})
class Host {
  delay = signal<number | string>(150);
}

describe('motion', () => {
  const originalIO = window.IntersectionObserver;

  beforeEach(() => (FakeIO.all = []));

  afterEach(() => {
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = originalIO;
  });

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, q: (s: string) => el.querySelector(s) as HTMLElement };
  }

  it('clamp01 limita entre 0 e 1', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(5)).toBe(1);
  });

  it('prefersReducedMotion le a preferencia do sistema', () => {
    setReducedMotion(true);
    expect(prefersReducedMotion()).toBeTrue();
  });

  describe('RevealDirective', () => {
    it('so revela quando entra na tela e aplica o atraso', () => {
      (window as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
      const { q } = render();
      const p = q('#r');
      const io = FakeIO.all[0];
      expect(p.classList).toContain('reveal');
      expect(p.style.transitionDelay).toBe('150ms');
      io.enter(false);
      expect(p.classList).not.toContain('is-visible');
      io.enter(true);
      expect(io.disconnected).toBeTrue();
      expect(p.classList).toContain('is-visible');
    });

    it('falha segura: sem IntersectionObserver o conteudo aparece direto', () => {
      (window as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
      expect(render().q('#r').classList).toContain('is-visible');
    });

    it('reduzir movimento: aparece direto', () => {
      setReducedMotion(true);
      expect(render().q('#r').classList).toContain('is-visible');
    });
  });

  describe('ScrollProgressDirective', () => {
    function mockRect(el: HTMLElement, top: number, height: number) {
      spyOn(el, 'getBoundingClientRect').and.returnValue({ top, height } as DOMRect);
    }

    it('modo pin: progresso e data-step conforme o scroll', () => {
      const { fixture, q } = render();
      const dir = fixture.debugElement.children[1].injector.get(ScrollProgressDirective);
      const el = q('#pin');
      const vh = window.innerHeight;
      const rect = { top: 0, height: vh * 3 };
      spyOn(el, 'getBoundingClientRect').and.callFake(() => rect as DOMRect);

      expect(dir.update()).toBe(0);
      expect(el.getAttribute('data-step')).toBe('0');

      rect.top = -vh; // metade do trecho rolavel (2vh)
      expect(dir.update()).toBeCloseTo(0.5);
      expect(el.style.getPropertyValue('--p')).toBe('0.5000');
      expect(el.getAttribute('data-step')).toBe('2');

      rect.top = -vh * 10;
      expect(dir.update()).toBe(1);
      expect(el.getAttribute('data-step')).toBe('3');
    });

    it('modo pin com secao menor que a tela nao divide por zero', () => {
      const { fixture, q } = render();
      const dir = fixture.debugElement.children[1].injector.get(ScrollProgressDirective);
      mockRect(q('#pin'), -10, 10);
      expect(dir.update()).toBe(1);
    });

    it('modo view: parallax de 0 a 1 enquanto atravessa a tela', () => {
      const { fixture, q } = render();
      const dir = fixture.debugElement.children[2].injector.get(ScrollProgressDirective);
      mockRect(q('#view'), window.innerHeight, 100);
      expect(dir.update()).toBe(0);
    });

    it('reduzir movimento congela o parallax', () => {
      setReducedMotion(true);
      const { fixture, q } = render();
      const dir = fixture.debugElement.children[2].injector.get(ScrollProgressDirective);
      mockRect(q('#view'), 0, 100);
      dir.update();
      expect(q('#view').style.getPropertyValue('--p')).toBe('0.5000');
    });

    it('atualiza no evento de scroll via requestAnimationFrame e limpa ao destruir', async () => {
      const { fixture, q } = render();
      const el = q('#pin');
      el.style.removeProperty('--p');
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll')); // varios eventos = um frame
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      expect(el.style.getPropertyValue('--p')).not.toBe('');
      const remove = spyOn(window, 'removeEventListener').and.callThrough();
      fixture.destroy();
      expect(remove).toHaveBeenCalledWith('scroll', jasmine.any(Function));
    });
  });

  describe('CountUpDirective', () => {
    it('anima ate o valor final formatado em pt-BR ao entrar na tela', async () => {
      (window as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
      const { q } = render();
      const span = q('#n');
      expect(span.textContent).toBe('+0,0h');
      FakeIO.last!.enter();
      await new Promise((r) => setTimeout(r, 80));
      expect(span.textContent).toBe('+1.500,0h');
    });

    it('sem IntersectionObserver mostra o valor final direto', () => {
      (window as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
      expect(render().q('#n').textContent).toBe('+1.500,0h');
    });
  });
});
