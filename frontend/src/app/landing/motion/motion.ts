/** Respeita a preferencia do sistema "reduzir movimento" (acessibilidade - RULES.md 8.6). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
