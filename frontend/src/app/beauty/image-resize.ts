/**
 * Prepara a foto no proprio navegador antes de enviar:
 * - corrige a rotacao do celular (o navegador aplica a orientacao EXIF ao desenhar);
 * - reduz para no maximo `maxSide` px e converte para JPEG (upload bem menor no 4G);
 * - aceita o que o navegador souber abrir (WebP, HEIC no Safari...) e entrega JPEG, que o servidor aceita.
 * Se o navegador nao conseguir abrir o arquivo, devolve o original (o servidor valida e responde).
 */
export async function prepareImage(file: Blob, maxSide = 2000, quality = 0.9): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  try {
    const { width, height } = fit(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}

/** Reduz mantendo a proporcao; nunca amplia. */
export function fit(width: number, height: number, maxSide: number): { width: number; height: number } {
  const factor = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}
