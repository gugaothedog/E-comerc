import { useState } from 'react';
import { Copy, Edit3, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { formatBRL, resolveAssetUrl, sanitizeId } from '../../lib/formatters';
import {
  deleteProductById,
  saveProductAndVariants,
  uploadMediaWithQuotaGuard,
} from '../../services/storeService';
import type { Brand, Category, InventoryVariant, Product } from '../../types/store';

interface SellerProductsTabProps {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  inventory: InventoryVariant[];
  storageBlocked: boolean;
}

export function SellerProductsTab({
  products,
  categories,
  brands,
  inventory,
  storageBlocked,
}: SellerProductsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [brandId, setBrandId] = useState(brands[0]?.id || '');
  const [model, setModel] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [promoPrice, setPromoPrice] = useState('');
  const [colorsInput, setColorsInput] = useState('Preto/Limão');
  const [sizesInput, setSizesInput] = useState('39, 40, 41, 42');
  const [images, setImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [featured, setFeatured] = useState(false);
  const [bestSeller, setBestSeller] = useState(false);
  const [isNewFlag, setIsNewFlag] = useState(true);
  const [onSale, setOnSale] = useState(false);
  const [active, setActive] = useState(true);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  const openNewModal = () => {
    setIsNew(true);
    setEditing(null);
    setName('');
    setBrandId(brands[0]?.id || '');
    setModel('');
    setCategoryId(categories[0]?.id || '');
    setSku(`PU-${Date.now().toString().slice(-5)}`);
    setDescription('');
    setOriginalPrice('');
    setPromoPrice('');
    setColorsInput('Preto/Limão');
    setSizesInput('39, 40, 41, 42');
    setImages([]);
    setVideoUrl('');
    setFeatured(false);
    setBestSeller(false);
    setIsNewFlag(true);
    setOnSale(false);
    setActive(true);
    setStockMap({});
    setModalOpen(true);
  };

  const openEditModal = (prod: Product, duplicate = false) => {
    setIsNew(duplicate);
    setEditing(duplicate ? null : prod);
    setName(duplicate ? `${prod.name} (Cópia)` : prod.name);
    setBrandId(prod.brandId);
    setModel(prod.model);
    setCategoryId(prod.categoryId);
    const targetSku = duplicate ? `${prod.sku}-C${Date.now().toString().slice(-3)}` : prod.sku;
    setSku(targetSku);
    setDescription(prod.description);
    setOriginalPrice(String(prod.originalPrice));
    setPromoPrice(prod.promoPrice ? String(prod.promoPrice) : '');
    setColorsInput(prod.colors.join(', '));
    setSizesInput(prod.sizes.join(', '));
    setImages(prod.images.slice(0, 4));
    setVideoUrl(prod.videoUrl || '');
    setFeatured(Boolean(prod.featured));
    setBestSeller(Boolean(prod.bestSeller));
    setIsNewFlag(Boolean(prod.isNew));
    setOnSale(Boolean(prod.onSale));
    setActive(prod.active);

    const map: Record<string, number> = {};
    for (const c of prod.colors) {
      for (const s of prod.sizes) {
        const oldVarId = `${prod.sku}_${c.replace(/[^a-zA-Z0-9]/g, '')}_${s.replace(/[^a-zA-Z0-9]/g, '')}`;
        const newVarId = `${targetSku}_${c.replace(/[^a-zA-Z0-9]/g, '')}_${s.replace(/[^a-zA-Z0-9]/g, '')}`;
        const existingVar = inventory.find((v) => v.id === oldVarId);
        map[newVarId] = existingVar ? existingVar.availableStock : 5;
      }
    }
    setStockMap(map);
    setModalOpen(true);
  };

  const parsedColors = colorsInput.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const parsedSizes = sizesInput.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (images.length >= 4) {
      setNotice('Limite máximo de 4 fotografias por produto.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const rec = await uploadMediaWithQuotaGuard({
        file,
        mediaType: 'image',
        productId: editing?.id,
        onProgress: setUploadPct,
      });
      setImages((prev) => [...prev, rec.url].slice(0, 4));
      setNotice('Fotografia enviada e contabilizada no Storage.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Falha no envio da fotografia.');
    } finally {
      setUploadPct(null);
      setBusy(false);
    }
  };

  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const rec = await uploadMediaWithQuotaGuard({
        file,
        mediaType: 'video',
        productId: editing?.id,
        onProgress: setUploadPct,
      });
      setVideoUrl(rec.url);
      setNotice('Vídeo (<= 10s) enviado e contabilizado no Storage.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Falha no envio do vídeo.');
    } finally {
      setUploadPct(null);
      setBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (images.length === 0) {
      setNotice('Adicione pelo menos 1 fotografia (upload ou caminho válido) antes de salvar.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const brand = brands.find((b) => b.id === brandId);
      const cat = categories.find((c) => c.id === categoryId);
      const prodId = editing ? editing.id : sanitizeId(`prod-${sku.toLowerCase()}-${Date.now().toString().slice(-4)}`);
      const promoNum = promoPrice.trim() ? Number(promoPrice) : null;

      await saveProductAndVariants(
        {
          id: prodId,
          name: name.trim(),
          brandId,
          brandName: brand?.name || 'Marca',
          model: model.trim() || name.trim(),
          description: description.trim(),
          originalPrice: Number(originalPrice),
          promoPrice: promoNum && promoNum > 0 ? promoNum : null,
          categoryId,
          categoryName: cat?.name || 'Categoria',
          sku: sku.trim().toUpperCase(),
          images: images.slice(0, 4),
          videoUrl: videoUrl.trim() || null,
          colors: parsedColors.length ? parsedColors : ['Padrão'],
          sizes: parsedSizes.length ? parsedSizes : ['Único'],
          featured,
          bestSeller,
          isNew: isNewFlag,
          onSale: Boolean(onSale || (promoNum && promoNum < Number(originalPrice))),
          active,
          soldCount: editing?.soldCount ?? 0,
        },
        stockMap,
        isNew
      );
      setModalOpen(false);
      setNotice(`Produto "${name}" salvo com sucesso.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao salvar produto.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (prod: Product) => {
    setBusy(true);
    setNotice(null);
    try {
      await deleteProductById(prod.id, prod.name);
      setNotice(`Produto "${prod.name}" removido.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao excluir produto.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (prod: Product) => {
    const map: Record<string, number> = {};
    inventory.filter((v) => v.productId === prod.id).forEach((v) => {
      map[v.id] = v.availableStock;
    });
    await saveProductAndVariants({ ...prod, active: !prod.active }, map, false);
  };

  const filtered = products.filter((p) => {
    if (filterCat && p.categoryId !== filterCat) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar produto ou SKU..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg"
            />
          </div>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg"
          >
            <option value="">Todas categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={openNewModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-zinc-950 text-lime-400 rounded-lg hover:bg-zinc-800 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar produto</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 text-xs font-medium bg-zinc-950 text-lime-400 rounded-lg">{notice}</div>
      )}

      <div className="border border-zinc-200 bg-white rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
              <th className="py-3 px-4 font-semibold">Produto</th>
              <th className="py-3 px-4 font-semibold">SKU</th>
              <th className="py-3 px-4 font-semibold">Marca / Cat.</th>
              <th className="py-3 px-4 font-semibold text-right">Preço</th>
              <th className="py-3 px-4 font-semibold text-right">Disponível</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.map((prod) => {
              const totalStock = inventory
                .filter((v) => v.productId === prod.id)
                .reduce((s, v) => s + v.availableStock, 0);
              return (
                <tr key={prod.id} className="hover:bg-zinc-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <img src={resolveAssetUrl(prod.images[0] || '')} alt={prod.name} className="w-10 h-8 object-cover rounded bg-zinc-100" />
                      <span className="font-semibold text-zinc-950">{prod.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-600">{prod.sku}</td>
                  <td className="py-3 px-4 text-zinc-600">{prod.brandName} · {prod.categoryName}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    <span className="font-bold text-zinc-950">
                      {formatBRL(prod.promoPrice || prod.originalPrice)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                    {totalStock} un.
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleToggleActive(prod)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        prod.active ? 'bg-lime-100 text-lime-800' : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {prod.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button onClick={() => openEditModal(prod, false)} title="Editar" className="p-1.5 text-zinc-600 hover:text-zinc-950 cursor-pointer">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEditModal(prod, true)} title="Duplicar" className="p-1.5 text-zinc-600 hover:text-zinc-950 cursor-pointer">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(prod)} title="Excluir" className="p-1.5 text-zinc-500 hover:text-red-600 cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="font-display text-lg font-bold">
                {isNew ? 'Cadastrar / Duplicar Produto' : `Editar ${editing?.name}`}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-zinc-500 hover:text-zinc-950 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold block mb-1">Nome do produto</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Modelo</label>
                  <input required value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Marca</label>
                  <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-lg bg-white">
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Categoria</label>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-lg bg-white">
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">SKU</label>
                  <input required value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold block mb-1">Preço original (R$)</label>
                    <input required type="number" step="0.01" min="1" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Promocional (R$)</label>
                    <input type="number" step="0.01" min="0" value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Descrição</label>
                <textarea rows={3} required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold block mb-1">Cores (separadas por vírgula)</label>
                  <input required value={colorsInput} onChange={(e) => setColorsInput(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Numerações (separadas por vírgula)</label>
                  <input required value={sizesInput} onChange={(e) => setSizesInput(e.target.value)} className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
                </div>
              </div>

              {/* Fotografias (até 4) e Vídeo (até 10s) */}
              <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">Fotografias ({images.length}/4) e Vídeo opcional (máx. 10s)</span>
                  {uploadPct !== null && <span className="font-mono text-lime-700">Enviando: {uploadPct}%</span>}
                </div>

                {storageBlocked && (
                  <p className="text-red-600 font-semibold">
                    Upload bloqueado: limite operacional de 4 GB do Firebase Storage atingido. Exclua arquivos na aba Armazenamento.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white font-semibold cursor-pointer ${storageBlocked || images.length >= 4 ? 'opacity-40 pointer-events-none' : ''}`}>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Enviar foto</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadPhoto} />
                  </label>
                  <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white font-semibold cursor-pointer ${storageBlocked ? 'opacity-40 pointer-events-none' : ''}`}>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Enviar vídeo (&le;10s)</span>
                    <input type="file" accept="video/*" className="hidden" onChange={handleUploadVideo} />
                  </label>
                </div>

                <div className="flex gap-2">
                  <input
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="Ou cole a URL da imagem..."
                    className="flex-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (imageUrlInput.trim() && images.length < 4) {
                        setImages([...images, imageUrlInput.trim()]);
                        setImageUrlInput('');
                      }
                    }}
                    className="px-3 py-1.5 bg-zinc-950 text-white rounded-lg cursor-pointer"
                  >
                    Adicionar URL
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative w-16 h-14 rounded border border-zinc-200 overflow-hidden">
                      <img src={resolveAssetUrl(img)} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 bg-zinc-950/80 text-white rounded px-1 text-[10px] cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                {videoUrl && (
                  <p className="text-[11px] text-lime-700 font-medium truncate">Vídeo anexado: {videoUrl}</p>
                )}
              </div>

              {/* Estoque por Cor + Numeração */}
              <div className="border border-zinc-200 rounded-xl p-4 space-y-2">
                <p className="font-semibold">Estoque disponível por variação (Cor × Numeração)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                  {parsedColors.flatMap((c) =>
                    parsedSizes.map((s) => {
                      const vId = `${sku.trim().toUpperCase()}_${c.replace(/[^a-zA-Z0-9]/g, '')}_${s.replace(/[^a-zA-Z0-9]/g, '')}`;
                      return (
                        <div key={vId} className="flex items-center justify-between gap-2 p-2 border border-zinc-200 rounded-lg">
                          <span className="truncate">{c} / {s}</span>
                          <input
                            type="number"
                            min={0}
                            value={stockMap[vId] ?? 5}
                            onChange={(e) => setStockMap({ ...stockMap, [vId]: Math.max(0, Number(e.target.value)) })}
                            className="w-14 px-2 py-1 border border-zinc-200 rounded text-right font-mono"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Destaque</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={bestSeller} onChange={(e) => setBestSeller(e.target.checked)} /> Mais vendido</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={isNewFlag} onChange={(e) => setIsNewFlag(e.target.checked)} /> Novidade</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={onSale} onChange={(e) => setOnSale(e.target.checked)} /> Oferta</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Produto ativo</label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-200">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-zinc-300 rounded-lg cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" disabled={busy} className="px-5 py-2 bg-zinc-950 text-lime-400 font-bold rounded-lg hover:bg-zinc-800 cursor-pointer">
                  {busy ? 'Salvando...' : 'Salvar produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
