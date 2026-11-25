import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { formatBRL } from '../lib/formatters';

export function CatalogPage({ searchParams }: { searchParams: string }) {
  const { products, categories, brands, inventory, getProductTotalAvailable } = useStore();
  const urlParams = new URLSearchParams(searchParams);

  const [queryText, setQueryText] = useState(urlParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState(urlParams.get('categoria') || '');
  const [selectedBrand, setSelectedBrand] = useState(urlParams.get('marca') || '');
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [maxPrice, setMaxPrice] = useState<number>(2000);
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [onlyOffers, setOnlyOffers] = useState(urlParams.get('ofertas') === '1');
  const [sortBy, setSortBy] = useState<'relevance' | 'price_asc' | 'price_desc'>('relevance');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    setQueryText(params.get('q') || '');
    setSelectedCategory(params.get('categoria') || '');
    setSelectedBrand(params.get('marca') || '');
    setOnlyOffers(params.get('ofertas') === '1');
  }, [searchParams]);

  const allColors = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.colors.forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }, [products]);

  const allSizes = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.sizes.forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => p.active && getProductTotalAvailable(p.id) > 0)
      .filter((p) => {
        if (queryText.trim()) {
          const q = queryText.toLowerCase();
          const match =
            p.name.toLowerCase().includes(q) ||
            p.brandName.toLowerCase().includes(q) ||
            p.model.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q);
          if (!match) return false;
        }
        if (selectedCategory && p.categoryId !== selectedCategory) return false;
        if (selectedBrand && p.brandId !== selectedBrand) return false;
        if (selectedColor && !p.colors.includes(selectedColor)) return false;
        if (selectedSize) {
          if (!p.sizes.includes(selectedSize)) return false;
          if (onlyAvailable) {
            const hasSizeStock = inventory.some(
              (v) => v.productId === p.id && v.size === selectedSize && v.availableStock > 0
            );
            if (!hasSizeStock) return false;
          }
        }
        const effectivePrice = p.promoPrice && p.promoPrice < p.originalPrice ? p.promoPrice : p.originalPrice;
        if (effectivePrice > maxPrice) return false;
        if (onlyOffers && !(p.onSale || (p.promoPrice && p.promoPrice < p.originalPrice))) return false;
        if (onlyAvailable && getProductTotalAvailable(p.id) <= 0) return false;
        return true;
      })
      .sort((a, b) => {
        const pa = a.promoPrice && a.promoPrice < a.originalPrice ? a.promoPrice : a.originalPrice;
        const pb = b.promoPrice && b.promoPrice < b.originalPrice ? b.promoPrice : b.originalPrice;
        if (sortBy === 'price_asc') return pa - pb;
        if (sortBy === 'price_desc') return pb - pa;
        return 0;
      });
  }, [
    products,
    queryText,
    selectedCategory,
    selectedBrand,
    selectedColor,
    selectedSize,
    maxPrice,
    onlyOffers,
    onlyAvailable,
    sortBy,
    inventory,
    getProductTotalAvailable,
  ]);

  const resetFilters = () => {
    setQueryText('');
    setSelectedCategory('');
    setSelectedBrand('');
    setSelectedSize('');
    setSelectedColor('');
    setMaxPrice(2000);
    setOnlyAvailable(true);
    setOnlyOffers(false);
  };

  const filterPanel = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-zinc-950">Filtros</h2>
        <button onClick={resetFilters} className="text-xs text-zinc-500 hover:text-zinc-950 underline cursor-pointer">
          Limpar
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-700 block">Categoria</label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white"
        >
          <option value="">Todas as categorias</option>
          {categories.filter((c) => c.active).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-700 block">Marca</label>
        <select
          value={selectedBrand}
          onChange={(e) => setSelectedBrand(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white"
        >
          <option value="">Todas as marcas</option>
          {brands.filter((b) => b.active).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-700 block">Numeração</label>
        <div className="flex flex-wrap gap-1.5">
          {allSizes.map((size) => (
            <button
              key={size}
              onClick={() => setSelectedSize(selectedSize === size ? '' : size)}
              className={`px-2.5 py-1.5 text-xs font-mono rounded-md border transition-colors cursor-pointer ${
                selectedSize === size
                  ? 'bg-zinc-950 text-white border-zinc-950'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-700 block">Cor</label>
        <select
          value={selectedColor}
          onChange={(e) => setSelectedColor(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white"
        >
          <option value="">Todas as cores</option>
          {allColors.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="font-semibold text-zinc-700">Preço máximo</span>
          <span className="font-mono tabular-nums font-semibold">{formatBRL(maxPrice)}</span>
        </div>
        <input
          type="range"
          min={150}
          max={2000}
          step={50}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="w-full accent-zinc-950"
        />
      </div>

      <div className="space-y-2.5 pt-2 border-t border-zinc-200">
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="rounded border-zinc-300 accent-zinc-950"
          />
          Somente com estoque disponível
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyOffers}
            onChange={(e) => setOnlyOffers(e.target.checked)}
            className="rounded border-zinc-300 accent-zinc-950"
          />
          Apenas em oferta
        </label>
      </div>
    </div>
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-950">
            {onlyOffers ? 'Ofertas Especiais' : 'Catálogo de Produtos'}
          </h1>
          <p className="text-sm text-zinc-500 mt-1 tabular-nums">
            {filteredProducts.length} produto(s) encontrado(s){onlyOffers ? ' com preço promocional' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Filtrar por nome ou SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'relevance' | 'price_asc' | 'price_desc')}
            className="px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white"
          >
            <option value="relevance">Relevância</option>
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
          </select>

          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium border border-zinc-300 rounded-lg bg-white cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filtros</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8">
        <aside className="hidden lg:block lg:col-span-3 border border-zinc-200 rounded-xl p-5 bg-white h-fit sticky top-28">
          {filterPanel}
        </aside>

        <section className="lg:col-span-9">
          {filteredProducts.length === 0 ? (
            <div className="border border-zinc-200 rounded-xl p-12 text-center space-y-3 bg-zinc-50">
              <p className="text-base font-semibold text-zinc-900">Nenhum produto corresponde aos filtros selecionados.</p>
              <p className="text-sm text-zinc-600">Tente remover alguns filtros ou ampliar a faixa de preço.</p>
              <button
                onClick={resetFilters}
                className="px-4 py-2 text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                Redefinir filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div onClick={() => setMobileFiltersOpen(false)} className="fixed inset-0 bg-zinc-950/50" />
          <div className="relative z-10 w-80 max-w-full bg-white h-full p-6 overflow-y-auto">
            <div className="flex justify-end mb-2">
              <button onClick={() => setMobileFiltersOpen(false)} className="p-1.5 text-zinc-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            {filterPanel}
          </div>
        </div>
      )}
    </main>
  );
}
