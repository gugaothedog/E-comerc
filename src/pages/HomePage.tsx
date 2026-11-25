import { useState } from 'react';
import { ArrowRight, Search, Star } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { HERO_BANNER_IMAGE } from '../lib/seedData';
import { resolveAssetUrl } from '../lib/formatters';
import { navigate } from '../lib/router';

type ShowcaseTab = 'featured' | 'bestSeller' | 'isNew' | 'onSale';

export function HomePage() {
  const { products, categories, brands, reviews, settings, getProductTotalAvailable } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ShowcaseTab>('featured');

  const activeProducts = products.filter((p) => p.active && getProductTotalAvailable(p.id) > 0);

  const tabProducts = activeProducts.filter((p) => {
    if (activeTab === 'featured') return p.featured;
    if (activeTab === 'bestSeller') return p.bestSeller;
    if (activeTab === 'isNew') return p.isNew;
    if (activeTab === 'onSale') return p.onSale || (p.promoPrice != null && p.promoPrice < p.originalPrice);
    return true;
  });

  const displayProducts = (tabProducts.length > 0 ? tabProducts : activeProducts).slice(0, 6);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    navigate(q ? `/catalogo?q=${encodeURIComponent(q)}` : '/catalogo');
  };

  return (
    <main>
      {/* Barra de pesquisa funcional + menu de categorias */}
      <section className="border-b border-zinc-200 bg-zinc-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <nav className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
            <button
              onClick={() => navigate('/catalogo')}
              className="px-3 py-1.5 text-xs font-semibold bg-zinc-950 text-white rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              Todos
            </button>
            {categories.filter((c) => c.active).map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/catalogo?categoria=${cat.id}`)}
                className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-md hover:border-zinc-400 hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {cat.name}
              </button>
            ))}
          </nav>

          <form onSubmit={handleSearch} className="relative w-full lg:w-80 shrink-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar tênis, marca ou SKU..."
              className="w-full pl-9 pr-20 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-950"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-semibold bg-zinc-950 text-white rounded-md hover:bg-zinc-800 cursor-pointer"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      {/* Banner Promocional Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl overflow-hidden bg-zinc-950 text-white border border-zinc-800 items-stretch">
          <div className="lg:col-span-5 p-8 sm:p-12 flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold tracking-wider text-lime-400">
                COLEÇÃO PERFORMANCE & RUA
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.08] [text-wrap:balance]">
                {settings.bannerTitle || 'Engenharia urbana para cada passada.'}
              </h1>
              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-md">
                {settings.bannerSubtitle || 'Curadoria de tênis esportivos, corrida e streetwear com estoque em tempo real e reserva garantida.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/catalogo')}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold bg-lime-400 text-zinc-950 rounded-lg hover:bg-lime-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Explorar catálogo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/catalogo?ofertas=1')}
                className="inline-flex items-center px-5 py-3 text-sm font-semibold border border-zinc-700 text-white rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Ver ofertas
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 relative min-h-[280px] lg:min-h-[440px]">
            <img
              src={resolveAssetUrl(settings.bannerImageUrl || HERO_BANNER_IMAGE)}
              alt="Tênis esportivo urbano Passo Urbano"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/60 via-transparent to-transparent pointer-events-none lg:block hidden" />
          </div>
        </div>
      </section>

      {/* Vitrine Segmentada: Destaques, Mais Vendidos, Novidades, Ofertas */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-200 pb-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-zinc-950 tracking-tight">
              Seleção da Loja
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              Estoque atualizado atomicamente por modelo, cor e numeração.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-zinc-100 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'featured', label: 'Destaques' },
                { id: 'bestSeller', label: 'Mais vendidos' },
                { id: 'isNew', label: 'Novidades' },
                { id: 'onSale', label: 'Ofertas' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-zinc-950 text-white'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="flex justify-center pt-2">
          <button
            onClick={() => navigate('/catalogo')}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold border border-zinc-300 text-zinc-900 rounded-lg hover:border-zinc-950 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            <span>Ver todos os {activeProducts.length} produtos</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Marcas Disponíveis + Avaliações */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        <div className="border-t border-zinc-200 pt-10 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-zinc-950">Marcas Disponíveis</h2>
            <button
              onClick={() => navigate('/catalogo')}
              className="text-xs font-semibold text-zinc-600 hover:text-zinc-950 cursor-pointer"
            >
              Filtrar no catálogo
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {brands.filter((b) => b.active).map((brand) => (
              <button
                key={brand.id}
                onClick={() => navigate(`/catalogo?marca=${brand.id}`)}
                className="p-4 border border-zinc-200 rounded-xl bg-white hover:border-zinc-950 hover:bg-zinc-50 transition-colors text-left cursor-pointer"
              >
                <span className="font-display text-base font-bold text-zinc-950 block">{brand.name}</span>
                <span className="text-xs text-zinc-500 mt-0.5 block truncate">{brand.description || 'Coleção oficial'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-200 pt-10 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-zinc-950">Avaliações de Clientes</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Comentários reais enviados por compradores autenticados.</p>
            </div>
          </div>

          {reviews.length === 0 ? (
            <div className="border border-zinc-200 rounded-xl p-8 bg-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Nenhuma avaliação registrada ainda.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  As avaliações exibidas aqui são 100% reais. Acesse qualquer produto para deixar sua opinião após entrar na sua conta.
                </p>
              </div>
              <button
                onClick={() => navigate('/catalogo')}
                className="px-4 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Avaliar produtos
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {reviews.slice(0, 3).map((rev) => (
                <div key={rev.id} className="border border-zinc-200 rounded-xl p-5 bg-white space-y-3">
                  <div className="flex items-center gap-1 text-lime-600">
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-4 h-4 fill-lime-500 text-lime-500" />
                    ))}
                  </div>
                  <p className="text-sm text-zinc-700 leading-relaxed">“{rev.comment}”</p>
                  <p className="text-xs font-semibold text-zinc-950">{rev.userName}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
