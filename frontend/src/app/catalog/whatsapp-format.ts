/**
 * Renderiza a formatacao do WhatsApp (*negrito*, _italico_, ~tachado~) em HTML para a pre-visualizacao.
 * Escapa o HTML ANTES de aplicar a formatacao: o texto nunca injeta tags.
 */
export function whatsappToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/gm, '$1<i>$2</i>')
    .replace(/\n/g, '<br>');
}
