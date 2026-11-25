import { Trash2, X, Plus, Minus, ArrowRight, AlertTriangle } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { formatBRL } from '../lib/formatters';
import { navigate } from '../lib/router';

export function CartDrawer() {
  const { items, subtotal, drawerOpen, setDrawerOpen, removeItem, updateQuantity } = useCart();
  const { getVariantStock } = useStore();

  if (!drawerOpen) return null;

  const hasUnavailable = items.some((item) => {
    const v = getVariantStock(item.variantId);
    return !v || v.availableStock < item.quantity;
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        onClick={() => setDrawerOpen(false)}
        className="fixed inset-0 bg-zinc-950/50 backdrop-blur-xs transition-opacity"
      />
      <aside className="relative z-10 w-full max-w-md bg-white h-full flex flex-col border-l border-zinc-200 shadow-2xl">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-zinc-950">Sua Sacola</h2>
            <p className="text-xs text-zinc-500">
              A reserva de estoque ocorre por 10 min ao iniciar o pagamento.
            </p>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 text-zinc-500 hover:text-zinc-950 rounded-lg hover:bg-zinc-100 cursor-pointer"
            aria-label="Fechar sacola"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-sm text-zinc-600">Sua sacola está vazia no momento.</p>
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  navigate('/catalogo');
                }}
                className="px-4 py-2 text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                Explorar catálogo
              </button>
            </div>
          ) : (
            items.map((item) => {
              const liveVariant = getVariantStock(item.variantId);
              const available = liveVariant?.availableStock ?? 0;
              const isShort = available < item.quantity;

              return (
                <div key={item.variantId} className="flex gap-4 pb-4 border-b border-zinc-100">
                  <img
                    src={item.image}
                    alt={item.productName}
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 object-cover rounded-lg bg-zinc-100 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-zinc-950 truncate">{item.productName}</h3>
                      <button
                        onClick={() => removeItem(item.variantId)}
                        className="text-zinc-400 hover:text-red-600 p-1 cursor-pointer"
                        aria-label="Remover item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {item.color} · Tam. <span className="font-mono">{item.size}</span>
                    </p>

                    {isShort && (
                      <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Disponível agora: {available} un.
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                      <div className="inline-flex items-center border border-zinc-200 rounded-lg">
                        <button
                          onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                          className="p-1.5 text-zinc-600 hover:text-zinc-950 cursor-pointer"
                          aria-label="Diminuir quantidade"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2.5 text-xs font-mono tabular-nums font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.variantId, Math.min(available || 1, item.quantity + 1))}
                          className="p-1.5 text-zinc-600 hover:text-zinc-950 cursor-pointer"
                          aria-label="Aumentar quantidade"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-bold font-mono tabular-nums text-zinc-950">
                        {formatBRL(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t border-zinc-200 bg-zinc-50 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-600">Subtotal</span>
              <span className="text-lg font-bold font-mono tabular-nums text-zinc-950">
                {formatBRL(subtotal)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  navigate('/carrinho');
                }}
                className="px-4 py-2.5 text-sm font-semibold border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                Ver carrinho
              </button>
              <button
                disabled={hasUnavailable}
                onClick={() => {
                  setDrawerOpen(false);
                  navigate('/checkout');
                }}
                className="px-4 py-2.5 text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Finalizar</span>
                <ArrowRight className="w-4 h-4 text-lime-400" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
