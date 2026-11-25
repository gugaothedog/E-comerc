import type { Brand, Category, Coupon, InventoryVariant, Product, StoreSettings } from '../types/store';

export const HERO_BANNER_IMAGE = '/src/assets/images/hero_urban_sneaker_1795554338720.jpg';

export const INITIAL_CATEGORIES: Omit<Category, 'createdAt' | 'updatedAt'>[] = [
  { id: 'cat-esportivos', name: 'Tênis Esportivos', slug: 'tenis-esportivos', description: 'Alta performance para treino e academia', active: true, sortOrder: 1 },
  { id: 'cat-corrida', name: 'Tênis de Corrida', slug: 'tenis-de-corrida', description: 'Amortecimento responsivo e retorno de energia', active: true, sortOrder: 2 },
  { id: 'cat-casuais', name: 'Tênis Casuais', slug: 'tenis-casuais', description: 'Conforto diário com acabamento premium', active: true, sortOrder: 3 },
  { id: 'cat-urbanos', name: 'Tênis Urbanos', slug: 'tenis-urbanos', description: 'Silhuetas streetwear de edição selecionada', active: true, sortOrder: 4 },
  { id: 'cat-acessorios', name: 'Acessórios', slug: 'acessorios', description: 'Meias técnicas, kits de limpeza e pochetes', active: true, sortOrder: 5 },
];

export const INITIAL_BRANDS: Omit<Brand, 'createdAt' | 'updatedAt'>[] = [
  { id: 'brand-nike', name: 'Nike', slug: 'nike', description: 'Inovação esportiva e linha Air', active: true },
  { id: 'brand-adidas', name: 'Adidas', slug: 'adidas', description: 'Performance e herança urbana', active: true },
  { id: 'brand-puma', name: 'Puma', slug: 'puma', description: 'Velocidade e design contemporâneo', active: true },
  { id: 'brand-asics', name: 'Asics', slug: 'asics', description: 'Estabilidade e engenharia de corrida', active: true },
  { id: 'brand-new-balance', name: 'New Balance', slug: 'new-balance', description: 'Conforto clássico e tecnologia Fresh Foam', active: true },
  { id: 'brand-mizuno', name: 'Mizuno', slug: 'mizuno', description: 'Placa Wave e precisão japonesa', active: true },
];

export const INITIAL_PRODUCTS: Omit<Product, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'prod-nike-air-max',
    name: 'Nike Air Max Pulse Velocity',
    brandId: 'brand-nike',
    brandName: 'Nike',
    model: 'Air Max Pulse',
    description: 'Cabedal em mesh respirável de dupla camada, contraforte estabilizador em TPU e unidade Air de alto impacto para corridas urbanas e uso prolongado.',
    originalPrice: 999.9,
    promoPrice: 799.9,
    categoryId: 'cat-corrida',
    categoryName: 'Tênis de Corrida',
    sku: 'NIKE-AMP-01',
    images: [
      '/src/assets/images/sneaker_air_runner_1795554338944.jpg',
      '/src/assets/images/hero_urban_sneaker_1795554338720.jpg',
    ],
    videoUrl: null,
    colors: ['Branco/Limão', 'Preto/Grafite'],
    sizes: ['39', '40', '41', '42', '43'],
    featured: true,
    bestSeller: true,
    isNew: true,
    onSale: true,
    active: true,
    soldCount: 0,
  },
  {
    id: 'prod-adidas-court-grafite',
    name: 'Adidas Court Minimal Grafite',
    brandId: 'brand-adidas',
    brandName: 'Adidas',
    model: 'Court Minimal',
    description: 'Couro legítimo macio em tom giz com painel traseiro em camurça grafite e solado cupsole vulcanizado para máximo conforto no cotidiano urbano.',
    originalPrice: 649.9,
    promoPrice: null,
    categoryId: 'cat-casuais',
    categoryName: 'Tênis Casuais',
    sku: 'ADI-CMG-02',
    images: [
      '/src/assets/images/sneaker_street_court_1795554339854.jpg',
    ],
    videoUrl: null,
    colors: ['Branco/Grafite'],
    sizes: ['37', '38', '39', '40', '41', '42'],
    featured: true,
    bestSeller: true,
    isNew: false,
    onSale: false,
    active: true,
    soldCount: 0,
  },
  {
    id: 'prod-asics-carbon-trail',
    name: 'Asics Carbon Trail Pro',
    brandId: 'brand-asics',
    brandName: 'Asics',
    model: 'Carbon Trail Pro',
    description: 'Entressola com placa de propulsão em carbono, cabedal em tricô técnico de alta resistência e solado tratorado com composto aderente em piso molhado.',
    originalPrice: 1199.9,
    promoPrice: 979.9,
    categoryId: 'cat-esportivos',
    categoryName: 'Tênis Esportivos',
    sku: 'ASC-CTP-03',
    images: [
      '/src/assets/images/sneaker_trail_carbon_1795554340601.jpg',
    ],
    videoUrl: null,
    colors: ['Grafite/Limão', 'Preto'],
    sizes: ['39', '40', '41', '42', '43', '44'],
    featured: true,
    bestSeller: false,
    isNew: true,
    onSale: true,
    active: true,
    soldCount: 0,
  },
  {
    id: 'prod-nb-mid-urbano',
    name: 'New Balance 550 Mid Urbano',
    brandId: 'brand-new-balance',
    brandName: 'New Balance',
    model: '550 Mid',
    description: 'Construção em couro texturizado grafite com recortes off-white, colarinho acolchoado e detalhe de ilhós em verde-limão exclusivo da edição urbana.',
    originalPrice: 849.9,
    promoPrice: null,
    categoryId: 'cat-urbanos',
    categoryName: 'Tênis Urbanos',
    sku: 'NB-550M-04',
    images: [
      '/src/assets/images/sneaker_retro_high_1795554340183.jpg',
    ],
    videoUrl: null,
    colors: ['Grafite/Off-White'],
    sizes: ['38', '39', '40', '41', '42'],
    featured: false,
    bestSeller: true,
    isNew: true,
    onSale: false,
    active: true,
    soldCount: 0,
  },
  {
    id: 'prod-kit-urbano-acessorios',
    name: 'Kit Passo Urbano Performance & Care',
    brandId: 'brand-puma',
    brandName: 'Puma',
    model: 'Urban Pack',
    description: 'Combo funcional composto por par de meias técnicas de compressão, pochete esportiva resistente à água e kit completo de escova e limpeza para sneakers.',
    originalPrice: 289.9,
    promoPrice: 229.9,
    categoryId: 'cat-acessorios',
    categoryName: 'Acessórios',
    sku: 'PUM-UPK-05',
    images: [
      '/src/assets/images/accessories_urban_pack_1795554341137.jpg',
    ],
    videoUrl: null,
    colors: ['Preto/Limão'],
    sizes: ['Único'],
    featured: false,
    bestSeller: false,
    isNew: true,
    onSale: true,
    active: true,
    soldCount: 0,
  },
  {
    id: 'prod-mizuno-wave-runner',
    name: 'Mizuno Wave Velocity Night',
    brandId: 'brand-mizuno',
    brandName: 'Mizuno',
    model: 'Wave Velocity',
    description: 'Placa Wave estendida para transição suave da passada, espuma de dupla densidade e detalhes refletivos noturnos para treinos de rua.',
    originalPrice: 899.9,
    promoPrice: 749.9,
    categoryId: 'cat-corrida',
    categoryName: 'Tênis de Corrida',
    sku: 'MIZ-WVN-06',
    images: [
      '/src/assets/images/hero_urban_sneaker_1795554338720.jpg',
      '/src/assets/images/sneaker_trail_carbon_1795554340601.jpg',
    ],
    videoUrl: null,
    colors: ['Preto/Limão'],
    sizes: ['39', '40', '41', '42'],
    featured: true,
    bestSeller: true,
    isNew: false,
    onSale: true,
    active: true,
    soldCount: 0,
  },
];

export function buildInitialInventory(): Omit<InventoryVariant, 'updatedAt'>[] {
  const variants: Omit<InventoryVariant, 'updatedAt'>[] = [];
  for (const prod of INITIAL_PRODUCTS) {
    for (const color of prod.colors) {
      for (const size of prod.sizes) {
        const cleanColor = color.replace(/[^a-zA-Z0-9]/g, '');
        const cleanSize = size.replace(/[^a-zA-Z0-9]/g, '');
        const id = `${prod.sku}_${cleanColor}_${cleanSize}`;
        // Mantém propositalmente 1 última unidade no Nike Air Max tamanho 40 e algumas numerações esgotadas (0 un.)
        let stock = 6;
        if (prod.id === 'prod-nike-air-max' && size === '40') {
          stock = 1;
        } else if (
          (prod.id === 'prod-nike-air-max' && size === '43') ||
          (prod.id === 'prod-adidas-court-grafite' && (size === '37' || size === '42')) ||
          (prod.id === 'prod-asics-carbon-trail' && size === '44') ||
          (prod.id === 'prod-nb-mid-urbano' && size === '38') ||
          (prod.id === 'prod-mizuno-wave-runner' && size === '42')
        ) {
          stock = 0;
        } else if (size === '43' || size === '44') {
          stock = 2;
        }
        variants.push({
          id,
          productId: prod.id,
          sku: prod.sku,
          productName: prod.name,
          color,
          size,
          availableStock: stock,
          reservedStock: 0,
          soldStock: 0,
          lowStockThreshold: 2,
        });
      }
    }
  }
  return variants;
}

export const INITIAL_COUPONS: Omit<Coupon, 'createdAt'>[] = [
  { id: 'cupom-passo10', code: 'PASSO10', discountPercent: 10, minSubtotal: 200, active: true },
  { id: 'cupom-urbano15', code: 'URBANO15', discountPercent: 15, minSubtotal: 600, active: true },
];

export const DEFAULT_STORE_SETTINGS: Omit<StoreSettings, 'updatedAt'> = {
  storeName: 'PASSO URBANO',
  logoUrl: '',
  description: 'Curadoria especializada em tênis esportivos, corrida de alta performance, silhuetas urbanas e acessórios técnicos.',
  phone: '(11) 3040-8890',
  whatsapp: '5511998801234',
  email: 'atendimento@passourbano.com.br',
  address: 'Av. Paulista, 1450 — Bela Vista, São Paulo - SP',
  instagram: '@passourbano.oficial',
  tiktok: '@passourbano',
  youtube: 'PassoUrbanoTV',
  shippingInfo: 'Frete grátis para todo o Brasil em compras acima de R$ 499,90. Despacho em até 24h úteis após confirmação do pagamento.',
  exchangePolicy: 'Primeira troca grátis em até 30 dias corridos após o recebimento, com produto sem sinais de uso e embalagem original.',
  privacyPolicy: 'Seus dados pessoais são protegidos por criptografia e isolamento estrito, sendo utilizados exclusivamente para processamento de pedidos e entregas.',
  cnpj: '48.920.114/0001-32',
  legalName: 'Passo Urbano Comércio de Calçados Esportivos Ltda.',
  storageLimitBytes: 4 * 1024 * 1024 * 1024, // 4 GB
  bannerTitle: 'Engenharia urbana para cada passada.',
  bannerSubtitle: 'Coleção de alta performance e edições limitadas com reserva imediata de estoque garantida no checkout.',
  bannerImageUrl: HERO_BANNER_IMAGE,
};
