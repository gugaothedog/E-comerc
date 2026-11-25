import { useState } from 'react';
import { Package } from 'lucide-react';
import { formatBRL, resolveAssetUrl } from '../lib/formatters';
import { navigate } from '../lib/router';
import { useStore } from '../context/StoreContext';
import type { Product } from '../types/store';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { getProductTotalAvailable } = useStore();
  const [imgError, setImgError] = useState(false);

  const totalAvailable = getProductTotalAvailable(product.id);
  const currentPrice = product.promoPrice && product.promoPrice < product.originalPrice
    ? product.promoPrice
    : product.originalPrice;
  const hasDiscount = Boolean(product.promoPrice && product.promoPrice < product.originalPrice);

  return (
    <article
      onClick={() => navigate(`/produto/${product.id}`)}
      className="group cursor-pointer flex flex-col bg-white border border-zinc-200 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:border-zinc-400"
    >
      <div className="relative aspect-[4/3] w-full bg-zinc-100 overflow-hidden">
        {!imgError && product.images[0] ? (
          <img
            src={resolveAssetUrl(product.images[0])}
            alt={product.name}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-500 p-4 text-center">
            <Package className="w-8 h-8 mb-2 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-600">{product.name}</span>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="font-medium text-zinc-700">{product.brandName}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{product.categoryName}</span>
            {totalAvailable === 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-red-600 font-medium">Esgotado</span>
              </>
            ) : totalAvailable <= 2 ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-lime-700 font-semibold">Últimas unidades</span>
              </>
            ) : null}
          </div>

          <h3 className="text-base font-semibold text-zinc-950 leading-snug line-clamp-2 group-hover:text-zinc-700 transition-colors">
            {product.name}
          </h3>
        </div>

        <div className="pt-2 border-t border-zinc-100 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2 tabular-nums font-mono">
            <span className="text-base font-bold text-zinc-950">
              {formatBRL(currentPrice)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-zinc-400 line-through">
                {formatBRL(product.originalPrice)}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-zinc-500 whitespace-nowrap">
            {product.sizes.length} tam.
          </span>
        </div>
      </div>
    </article>
  );
}
