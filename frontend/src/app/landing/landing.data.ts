// Textos PADRAO do site. O dono troca tudo isso pela pagina de gestao (/gestao); estes valores so aparecem
// enquanto ele nao salvar (ou se a API estiver fora do ar). Ver core/site-config.ts.

export type ArtKind = 'dog' | 'cat' | 'house' | 'bowl' | 'scissors' | 'heart';
export type Scene = 'hotel' | 'food' | 'beauty' | 'vet';

export const NAV_LINKS = [
  { label: 'Hotel', href: '#hotel' },
  { label: 'Rações', href: '#racoes' },
  { label: 'Beleza', href: '#beleza' },
  { label: 'Veterinário', href: '#veterinario' },
  { label: 'App', href: '#app' },
  { label: 'Loja', href: '/racoes' },
];

export const SERVICES = ['Hotel', 'Rações', 'Banho & Tosa', 'Veterinário', 'Day Care', 'Spa'];

/**
 * Endereco e localizacao da loja (rodape + mapa).
 * TODO(negocio): PROVISORIO - substituir pelo endereco e coordenadas reais.
 * Para pegar lat/lng: Google Maps > clique com o botao direito no ponto > copiar coordenadas.
 */
export const STORE = {
  name: 'MundoPet',
  street: 'Rua Exemplo, 123',
  district: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  zip: '01000-000',
  hours: 'Seg a Sáb · 8h às 20h',
  clinicHours: 'Clínica: 24 horas',
  lat: -23.5505,
  lng: -46.6333,
  /**
   * O que o Google Maps procura. Com a loja cadastrada no Google, use "MundoPet, Rua X 123, Cidade"
   * para o mapa mostrar o cartao da empresa (avaliacoes, fotos). Vazio = usa as coordenadas.
   */
  mapsQuery: '',
  // TODO(negocio): perfil real do Instagram
  instagram: 'https://www.instagram.com/',
};

export const PILLARS =['Hospedagem', 'Nutrição', 'Beleza', 'Saúde'];

/** Camadas da "anatomia do cuidado", de cima para baixo. O pet fica no centro. */
export const ANATOMY_LAYERS: { art: ArtKind; label: string; text: string; center?: boolean }[] = [
  { art: 'house', label: 'Hotel & Day Care', text: 'Suítes climatizadas e recreação monitorada.' },
  { art: 'scissors', label: 'Banho & Tosa', text: 'Spa completo com produtos hipoalergênicos.' },
  { art: 'dog', label: 'Seu melhor amigo', text: 'No centro de tudo o que fazemos.', center: true },
  { art: 'heart', label: 'Veterinário 24h', text: 'Clínica, vacinas, exames e emergência.' },
  { art: 'bowl', label: 'Rações & Petiscos', text: 'Nutrição premium com entrega no mesmo dia.' },
];

export interface Chapter {
  id: string;
  scene: Scene;
  number: string;
  kicker: string;
  title: string;
  titleEm: string;
  text: string;
  features: string[];
  cta: string;
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'hotel',
    scene: 'hotel',
    number: '01',
    kicker: 'Hotel & Day Care',
    title: 'Férias para ele,',
    titleEm: 'paz para você',
    text: 'Suítes climatizadas, recreação em grupo e câmeras ao vivo para você matar a saudade pelo celular, de onde estiver.',
    features: ['Suítes climatizadas', 'Câmeras ao vivo 24h', 'Recreação monitorada', 'Relatório diário com fotos'],
    cta: 'Reservar hospedagem',
  },
  {
    id: 'racoes',
    scene: 'food',
    number: '02',
    kicker: 'Rações & Petiscos',
    title: 'Nutrição que vira',
    titleEm: 'energia',
    text: 'Rações premium, naturais e dietas veterinárias, com consultoria de nutrição para cada fase da vida do seu pet.',
    features: ['Linhas premium e naturais', 'Dietas veterinárias', 'Assinatura com desconto', 'Entrega no mesmo dia'],
    cta: 'Ver catálogo de rações',
  },
  {
    id: 'beleza',
    scene: 'beauty',
    number: '03',
    kicker: 'Banho & Tosa',
    title: 'Saia do spa',
    titleEm: 'irresistível',
    text: 'Banho com produtos hipoalergênicos, tosa na tesoura, hidratação e aromaterapia — com leva e traz.',
    features: ['Produtos hipoalergênicos', 'Tosa na tesoura e higiênica', 'Hidratação e aromaterapia', 'Leva e traz'],
    cta: 'Agendar banho',
  },
  {
    id: 'veterinario',
    scene: 'vet',
    number: '04',
    kicker: 'Clínica Veterinária',
    title: 'Cuidado de quem',
    titleEm: 'entende',
    text: 'Consultas, vacinas, exames e especialistas. E se acontecer algo de madrugada, estamos aqui: atendimento 24h.',
    features: ['Pronto atendimento 24h', 'Vacinas e check-ups', 'Exames laboratoriais', 'Especialistas'],
    cta: 'Marcar consulta',
  },
];

export const STATS = [
  { value: 15000, prefix: '+', suffix: '', decimals: 0, label: 'pets atendidos' },
  { value: 12, prefix: '', suffix: ' anos', decimals: 0, label: 'de experiência' },
  { value: 4.9, prefix: '', suffix: '★', decimals: 1, label: 'avaliação média' },
  { value: 24, prefix: '', suffix: 'h', decimals: 0, label: 'de plantão veterinário' },
];
