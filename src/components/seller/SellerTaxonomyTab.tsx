import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { sanitizeId, slugify } from '../../lib/formatters';
import {
  deleteBrand,
  deleteCategory,
  deleteCoupon,
  saveBrand,
  saveCategory,
  saveCoupon,
} from '../../services/storeService';
import type { Brand, Category, Coupon } from '../../types/store';

interface SellerTaxonomyTabProps {
  categories: Category[];
  brands: Brand[];
  coupons: Coupon[];
}

export function SellerTaxonomyTab({ categories, brands, coupons }: SellerTaxonomyTabProps) {
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [brandName, setBrandName] = useState('');
  const [brandDesc, setBrandDesc] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponPercent, setCouponPercent] = useState('10');
  const [couponMin, setCouponMin] = useState('200');
  const [notice, setNotice] = useState<string | null>(null);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    const slug = slugify(catName);
    await saveCategory(
      {
        id: sanitizeId(`cat-${slug}`),
        name: catName.trim(),
        slug,
        description: catDesc.trim(),
        active: true,
        sortOrder: categories.length + 1,
      },
      true
    );
    setCatName('');
    setCatDesc('');
    setNotice('Categoria salva com sucesso.');
  };

  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) return;
    const slug = slugify(brandName);
    await saveBrand(
      {
        id: sanitizeId(`brand-${slug}`),
        name: brandName.trim(),
        slug,
        description: brandDesc.trim(),
        active: true,
      },
      true
    );
    setBrandName('');
    setBrandDesc('');
    setNotice('Marca salva com sucesso.');
  };

  const handleAddCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    const clean = couponCode.trim().toUpperCase();
    await saveCoupon({
      id: sanitizeId(`cupom-${clean.toLowerCase()}`),
      code: clean,
      discountPercent: Math.min(90, Math.max(1, Number(couponPercent))),
      minSubtotal: Math.max(0, Number(couponMin)),
      active: true,
    });
    setCouponCode('');
    setNotice(`Cupom ${clean} criado.`);
  };

  return (
    <div className="space-y-8">
      {notice && <div className="p-3 text-xs font-medium bg-zinc-950 text-lime-400 rounded-lg">{notice}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Categorias */}
        <section className="border border-zinc-200 bg-white rounded-xl p-5 space-y-4">
          <h3 className="font-display text-base font-bold text-zinc-950">Categorias ({categories.length})</h3>
          <form onSubmit={handleAddCategory} className="space-y-2 text-xs">
            <div className="flex gap-2">
              <input required value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Nova categoria (ex: Corrida)" className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg" />
              <button type="submit" className="inline-flex items-center gap-1 px-3.5 py-2 bg-zinc-950 text-lime-400 font-bold rounded-lg cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
            <input value={catDesc} onChange={(e) => setCatDesc(e.target.value)} placeholder="Descrição breve (opcional)" className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </form>

          <div className="divide-y divide-zinc-100 text-xs">
            {categories.map((c) => (
              <div key={c.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-zinc-950">{c.name}</p>
                  <p className="text-[11px] text-zinc-500">{c.description || c.slug}</p>
                </div>
                <button onClick={() => deleteCategory(c.id)} className="p-1.5 text-zinc-400 hover:text-red-600 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Marcas */}
        <section className="border border-zinc-200 bg-white rounded-xl p-5 space-y-4">
          <h3 className="font-display text-base font-bold text-zinc-950">Marcas ({brands.length})</h3>
          <form onSubmit={handleAddBrand} className="space-y-2 text-xs">
            <div className="flex gap-2">
              <input required value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Nova marca (ex: Vans)" className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg" />
              <button type="submit" className="inline-flex items-center gap-1 px-3.5 py-2 bg-zinc-950 text-lime-400 font-bold rounded-lg cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
            <input value={brandDesc} onChange={(e) => setBrandDesc(e.target.value)} placeholder="Descrição breve (opcional)" className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </form>

          <div className="divide-y divide-zinc-100 text-xs">
            {brands.map((b) => (
              <div key={b.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-zinc-950">{b.name}</p>
                  <p className="text-[11px] text-zinc-500">{b.description || b.slug}</p>
                </div>
                <button onClick={() => deleteBrand(b.id)} className="p-1.5 text-zinc-400 hover:text-red-600 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Cupons de Desconto */}
      <section className="border border-zinc-200 bg-white rounded-xl p-5 space-y-4">
        <h3 className="font-display text-base font-bold text-zinc-950">Cupons Promocionais ({coupons.length})</h3>
        <form onSubmit={handleAddCoupon} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <input required value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Código (ex: PASSO20)" className="px-3 py-2 border border-zinc-200 rounded-lg font-mono uppercase" />
          <input required type="number" min={1} max={90} value={couponPercent} onChange={(e) => setCouponPercent(e.target.value)} placeholder="% desconto" className="px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
          <input required type="number" min={0} value={couponMin} onChange={(e) => setCouponMin(e.target.value)} placeholder="Pedido mínimo (R$)" className="px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
          <button type="submit" className="px-4 py-2 bg-zinc-950 text-lime-400 font-bold rounded-lg cursor-pointer">
            Criar cupom
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {coupons.map((c) => (
            <div key={c.id} className="p-3 border border-zinc-200 rounded-lg flex items-center justify-between">
              <div>
                <p className="font-mono font-bold text-zinc-950">{c.code}</p>
                <p className="text-zinc-500">{c.discountPercent}% OFF · Mín. R$ {c.minSubtotal}</p>
              </div>
              <button onClick={() => deleteCoupon(c.id)} className="p-1.5 text-zinc-400 hover:text-red-600 cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
