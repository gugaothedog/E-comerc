import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Film, Minus, Plus, ShieldCheck, Star } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { db } from '../lib/firebase';
import { formatBRL } from '../lib/formatters';
import { navigate } from '../lib/router';
import { getActiveBearerToken } from '../lib/sessionToken';

export function ProductPage({ productId }: { productId: string }) {
  const { products, inventory, reviews, refreshStore } = useStore();
  const { addItem } = useCart();
  const { firebaseUser, authUser, profile } = useAuth();

  const product = products.find((p) => p.id === productId);

  const getFirstAvailableSize = (color: string) => {
    if (!product) return '';
    const cColor = color.replace(/[^a-zA-Z0-9]/g, '');
    const firstAvail = product.sizes.find((sz) => {
      const vId = `${product.sku}_${cColor}_${sz.replace(/[^a-zA-Z0-9]/g, '')}`;
      const v = inventory.find((item) => item.id === vId);
      return (v?.availableStock ?? 0) > 0;
    });
    return firstAvail || '';
  };

  const [selectedColor, setSelectedColor] = useState(product?.colors[0] || '');
  const [selectedSize, setSelectedSize] = useState(() =>
    product ? getFirstAvailableSize(product.colors[0] || '') : ''
  );
  const [quantity, setQuantity] = useState(1);
  const [activeMediaIndex, setActiveMediaIndex] = useState<number>(0);
  const [showVideo, setShowVideo] = useState(false);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      const initialColor = product.colors[0] || '';
      setSelectedColor(initialColor);
      setSelectedSize(getFirstAvailableSize(initialColor));
      setQuantity(1);
      setActiveMediaIndex(0);
      setShowVideo(false);
    }
  }, [productId, product?.id]);

  useEffect(() => {
    if (!product) return;
    const cColor = selectedColor.replace(/[^a-zA-Z0-9]/g, '');
    const currentId = selectedSize
      ? `${product.sku}_${cColor}_${selectedSize.replace(/[^a-zA-Z0-9]/g, '')}`
      : '';
    const currentAvail = currentId
      ? inventory.find((item) => item.id === currentId)?.availableStock ?? 0
      : 0;
    if (currentAvail <= 0) {
      const nextAvail = getFirstAvailableSize(selectedColor);
      if (nextAvail !== selectedSize) {
        setSelectedSize(nextAvail);
      }
    }
  }, [inventory, selectedColor, product?.id]);

  if (!product) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold">Produto não encontrado</h1>
        <button
          onClick={() => navigate('/catalogo')}
          className="px-5 py-2.5 text-sm font-semibold bg-zinc-950 text-white rounded-lg cursor-pointer"
        >
          Voltar ao catálogo
        </button>
      </main>
    );
  }

  const cleanColor = selectedColor.replace(/[^a-zA-Z0-9]/g, '');
  const cleanSize = selectedSize.replace(/[^a-zA-Z0-9]/g, '');
  const variantId = selectedSize ? `${product.sku}_${cleanColor}_${cleanSize}` : '';
  const currentVariant = variantId ? inventory.find((v) => v.id === variantId) : undefined;
  const availableStock = currentVariant?.availableStock ?? 0;
  const reservedStock = currentVariant?.reservedStock ?? 0;
  const anyReservedInColor = product.sizes.some((sz) => {
    const vId = `${product.sku}_${cleanColor}_${sz.replace(/[^a-zA-Z0-9]/g, '')}`;
    const v = inventory.find((item) => item.id === vId);
    return (v?.availableStock ?? 0) === 0 && (v?.reservedStock ?? 0) > 0;
  });

  const effectivePrice =
    product.promoPrice && product.promoPrice < product.originalPrice
      ? product.promoPrice
      : product.originalPrice;

  const productReviews = reviews.filter((r) => r.productId === product.id);

  const handleAddToCart = (goToCheckout: boolean) => {
    if (!selectedSize || availableStock <= 0) return;
    addItem({
      variantId,
      productId: product.id,
      productName: product.name,
      brandName: product.brandName,
      sku: product.sku,
      color: selectedColor,
      size: selectedSize,
      quantity: Math.min(quantity, availableStock),
      unitPrice: effectivePrice,
      image: product.images[0] || '',
    });
    if (goToCheckout) {
      navigate('/checkout');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !authUser.emailVerified) {
      setReviewNotice('Entre com uma conta verificada para enviar uma avaliação.');
      return;
    }
    if (!comment.trim()) return;
    const revId = `rev_${Date.now()}_${authUser.uid.slice(0, 6)}`;
    try {
      if (firebaseUser) {
        await setDoc(doc(db, 'reviews', revId), {
          id: revId,
          productId: product.id,
          userId: firebaseUser.uid,
          userName: profile?.name || firebaseUser.displayName || 'Cliente Passo Urbano',
          rating,
          comment: comment.trim().slice(0, 1000),
          verifiedPurchase: true,
          createdAt: serverTimestamp(),
        });
      } else {
        const token = await getActiveBearerToken();
        const resp = await fetch('/api/store/reviews', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ productId: product.id, rating, comment }),
        });
        if (!resp.ok) throw new Error('Falha ao enviar avaliação.');
        await refreshStore();
      }
      setComment('');
      setReviewNotice('Avaliação publicada com sucesso.');
    } catch (err) {
      setReviewNotice(err instanceof Error ? err.message : 'Erro ao enviar avaliação.');
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-14">
      <button
        onClick={() => navigate('/catalogo')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Voltar para o catálogo</span>
      </button>

      {/* Módulo principal: Galeria fixa esquerda + Módulo de compra contínuo direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-7 space-y-4 lg:sticky lg:top-28">
          <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200">
            {showVideo && product.videoUrl ? (
              <video
                src={product.videoUrl}
                controls
                autoPlay
                loop
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={product.images[activeMediaIndex] || product.images[0]}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            )}
          </div>

          <div className="flex items-center gap-3 overflow-x-auto">
            {product.images.slice(0, 4).map((img, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setShowVideo(false);
                  setActiveMediaIndex(idx);
                }}
                className={`w-20 h-16 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer ${
                  !showVideo && activeMediaIndex === idx ? 'border-zinc-950' : 'border-zinc-200'
                }`}
              >
                <img src={img} alt={`${product.name} ${idx + 1}`} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </button>
            ))}
            {product.videoUrl && (
              <button
                onClick={() => setShowVideo(true)}
                className={`w-20 h-16 rounded-lg border-2 shrink-0 flex flex-col items-center justify-center gap-1 text-xs font-semibold bg-zinc-950 text-white cursor-pointer ${
                  showVideo ? 'border-lime-400' : 'border-zinc-800'
                }`}
              >
                <Film className="w-4 h-4 text-lime-400" />
                <span>Vídeo</span>
              </button>
            )}
          </div>
        </div>

        {/* Módulo de compra */}
        <div className="lg:col-span-5 border border-zinc-200 rounded-2xl p-6 sm:p-8 bg-white space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="font-semibold text-zinc-800">{product.brandName}</span>
              <span aria-hidden="true">·</span>
              <span>{product.categoryName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">SKU {product.sku}</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight [text-wrap:balance]">
              {product.name}
            </h1>
            <p className="text-xs text-zinc-500">Modelo {product.model}</p>
          </div>

          <div className="space-y-1 pb-5 border-b border-zinc-200">
            <div className="flex items-baseline gap-3 font-mono tabular-nums">
              <span className="text-3xl font-extrabold text-zinc-950">{formatBRL(effectivePrice)}</span>
              {product.promoPrice && product.promoPrice < product.originalPrice && (
                <span className="text-sm text-zinc-400 line-through">{formatBRL(product.originalPrice)}</span>
              )}
            </div>
            <p className="text-xs text-zinc-600">
              Em até 10x sem juros ou Pix à vista via Mercado Pago
            </p>
          </div>

          {/* Seleção de Cor */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-800">Cor selecionada</span>
              <span className="text-zinc-600">{selectedColor}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    setSelectedColor(color);
                    setSelectedSize(getFirstAvailableSize(color));
                    setQuantity(1);
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    selectedColor === color
                      ? 'bg-zinc-950 text-white border-zinc-950'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>

          {/* Seleção de Numeração com estoque individual */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-800">Numeração</span>
              <span className="font-mono tabular-nums text-zinc-600">
                {availableStock > 0
                  ? `${availableStock} disponível(is)`
                  : reservedStock > 0
                  ? 'Reservado em checkout ativo'
                  : 'Sem estoque nesta cor'}
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {product.sizes.map((size) => {
                const vId = `${product.sku}_${cleanColor}_${size.replace(/[^a-zA-Z0-9]/g, '')}`;
                const v = inventory.find((item) => item.id === vId);
                const avail = v?.availableStock ?? 0;
                const isOutOfStock = avail <= 0;
                const isSelected = !isOutOfStock && selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    disabled={isOutOfStock}
                    aria-disabled={isOutOfStock}
                    title={isOutOfStock ? 'Numeração sem estoque' : `Selecionar tamanho ${size}`}
                    onClick={() => {
                      if (isOutOfStock) return;
                      setSelectedSize(size);
                      setQuantity(1);
                    }}
                    className={`py-2.5 text-sm font-mono tabular-nums font-semibold rounded-lg border transition-colors ${
                      isOutOfStock
                        ? 'bg-zinc-700 text-zinc-300 border-zinc-700 cursor-not-allowed line-through opacity-80'
                        : isSelected
                        ? 'bg-zinc-950 text-lime-400 border-zinc-950 cursor-pointer'
                        : 'bg-white text-zinc-900 border-zinc-200 hover:border-zinc-950 cursor-pointer'
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
            {availableStock === 1 && (
              <p className="text-xs font-semibold text-lime-700">
                Última unidade disponível nesta variação. A reserva é garantida no checkout por 10 minutos.
              </p>
            )}
            {anyReservedInColor && (
              <p className="text-xs font-medium text-amber-700">
                Algumas numerações indisponíveis estão temporariamente reservadas no checkout de outro cliente (expira em até 10 min caso não seja paga).
              </p>
            )}
          </div>

          {/* Quantidade e Botões de Compra */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700">Quantidade</span>
              <div className="inline-flex items-center border border-zinc-200 rounded-lg">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={availableStock <= 0}
                  className="p-2 text-zinc-600 hover:text-zinc-950 disabled:opacity-40 cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-4 text-sm font-mono tabular-nums font-semibold">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(Math.max(1, availableStock), q + 1))}
                  disabled={availableStock <= 0 || quantity >= availableStock}
                  className="p-2 text-zinc-600 hover:text-zinc-950 disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              disabled={availableStock <= 0}
              onClick={() => handleAddToCart(true)}
              className="w-full py-3.5 px-6 text-sm font-bold bg-lime-400 text-zinc-950 rounded-lg hover:bg-lime-300 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {availableStock > 0 ? 'Comprar agora' : 'Variação indisponível'}
            </button>

            <button
              disabled={availableStock <= 0}
              onClick={() => handleAddToCart(false)}
              className="w-full py-3 px-6 text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Adicionar à sacola
            </button>

            <div className="pt-2 flex items-center gap-2 text-xs text-zinc-500">
              <ShieldCheck className="w-4 h-4 text-lime-600 shrink-0" />
              <span>Controle de estoque atômico: nenhuma unidade duplicada ou negativa.</span>
            </div>
          </div>

          <div className="pt-5 border-t border-zinc-200 space-y-2">
            <h2 className="text-sm font-bold text-zinc-950">Descrição técnica</h2>
            <p className="text-sm text-zinc-600 leading-relaxed">{product.description}</p>
          </div>
        </div>
      </div>

      {/* Avaliações do Produto */}
      <section className="border-t border-zinc-200 pt-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5 space-y-4">
          <h2 className="font-display text-xl font-bold text-zinc-950">Avaliar este produto</h2>
          <form onSubmit={handleReviewSubmit} className="border border-zinc-200 rounded-xl p-5 bg-zinc-50 space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1.5">Nota</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="p-1 cursor-pointer"
                  >
                    <Star className={`w-5 h-5 ${n <= rating ? 'fill-lime-500 text-lime-500' : 'text-zinc-300'}`} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1.5">Comentário</label>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Conte sobre conforto, numeração e acabamento..."
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white"
              />
            </div>
            {reviewNotice && <p className="text-xs font-medium text-zinc-700">{reviewNotice}</p>}
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              Publicar avaliação
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <h2 className="font-display text-xl font-bold text-zinc-950">
            Avaliações ({productReviews.length})
          </h2>
          {productReviews.length === 0 ? (
            <p className="text-sm text-zinc-500">Ainda não há avaliações registradas para este modelo.</p>
          ) : (
            <div className="space-y-4">
              {productReviews.map((rev) => (
                <div key={rev.id} className="border border-zinc-200 rounded-xl p-5 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-950">{rev.userName}</span>
                      {rev.verifiedPurchase && (
                        <span className="inline-flex items-center gap-1 text-xs text-lime-700 font-medium">
                          <Check className="w-3.5 h-3.5" /> Verificado
                        </span>
                      )}
                    </div>
                    <div className="flex gap-0.5">
                      {Array.from({ length: rev.rating }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-lime-500 text-lime-500" />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-700">{rev.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
