import { useState } from 'react';
import { AlertTriangle, ArrowRight, Minus, Plus, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { formatBRL, resolveAssetUrl } from '../lib/formatters';
import { navigate } from '../lib/router';

export function CartPage() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();
  const { coupons, getVariantStock } = useStore();

  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [couponMessage, setCouponMessage] = useState('');
  const [cep, setCep] = useState('');
  const [shippingCost, setShippingCost] = useState<number | null>(null);

  const activeCoupon = coupons.find(
    (c) => c.active && c.code.toUpperCase() === appliedCouponCode.toUpperCase()
  );
  const discountAmount =
    activeCoupon && subtotal >= activeCoupon.minSubtotal
      ? Number(((subtotal * activeCoupon.discountPercent) / 100).toFixed(2))
      : 0;

  const effectiveShipping =
    subtotal >= 499.9 ? 0 : shippingCost !== null ? shippingCost : 24.9;
  const total = Math.max(0, subtotal - discountAmount + effectiveShipping);

  const hasStockError = items.some((item) => {
    const v = getVariantStock(item.variantId);
    return !v || v.availableStock < item.quantity;
  });

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const code = couponInput.trim().toUpperCase();
    const found = coupons.find((c) => c.active && c.code.toUpperCase() === code);
    if (!found) {
      setCouponMessage('Cupom inválido ou expirado.');
      return;
    }
    if (subtotal < found.minSubtotal) {
      setCouponMessage(`Este cupom exige subtotal mínimo de ${formatBRL(found.minSubtotal)}.`);
      return;
    }
    setAppliedCouponCode(found.code);
    setCouponMessage(`Cupom ${found.code} (${found.discountPercent}% OFF) aplicado.`);
  };

  const handleCalculateShipping = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    if (subtotal >= 499.9) {
      setShippingCost(0);
    } else {
      const regionDigit = Number(clean[0]);
      setShippingCost(regionDigit <= 2 ? 19.9 : regionDigit <= 5 ? 24.9 : 32.9);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="border-b border-zinc-200 pb-5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-950">Carrinho de Compras</h1>
        <p className="text-sm text-zinc-500 mt-1">
          A disponibilidade é verificada em tempo real. A reserva atômica de 10 minutos inicia ao avançar para o pagamento.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border border-zinc-200 rounded-2xl p-12 text-center space-y-4 bg-zinc-50">
          <p className="text-base font-semibold text-zinc-900">Seu carrinho está vazio.</p>
          <button
            onClick={() => navigate('/catalogo')}
            className="px-6 py-3 text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            Ir para o catálogo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-4">
            {items.map((item) => {
              const live = getVariantStock(item.variantId);
              const available = live?.availableStock ?? 0;
              const unavailable = available < item.quantity;

              return (
                <div
                  key={item.variantId}
                  className="border border-zinc-200 rounded-xl p-4 sm:p-5 bg-white flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={resolveAssetUrl(item.image)}
                      alt={item.productName}
                      referrerPolicy="no-referrer"
                      className="w-24 h-20 object-cover rounded-lg bg-zinc-100 shrink-0"
                    />
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500">{item.brandName} · SKU <span className="font-mono">{item.sku}</span></p>
                      <h3 className="text-base font-bold text-zinc-950">{item.productName}</h3>
                      <p className="text-xs text-zinc-600">
                        Cor: {item.color} · Tamanho: <span className="font-mono font-semibold">{item.size}</span>
                      </p>
                      {unavailable && (
                        <p className="text-xs font-semibold text-red-600 flex items-center gap-1 pt-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Estoque atualizado: apenas {available} unidade(s) disponível(is).
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="inline-flex items-center border border-zinc-200 rounded-lg">
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        className="p-2 text-zinc-600 hover:text-zinc-950 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="px-3 text-sm font-mono tabular-nums font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.variantId, Math.min(Math.max(1, available), item.quantity + 1))}
                        className="p-2 text-zinc-600 hover:text-zinc-950 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-right font-mono tabular-nums">
                      <p className="text-base font-bold text-zinc-950">{formatBRL(item.unitPrice * item.quantity)}</p>
                      <p className="text-xs text-zinc-500">{formatBRL(item.unitPrice)} / un.</p>
                    </div>

                    <button
                      onClick={() => removeItem(item.variantId)}
                      className="p-2 text-zinc-400 hover:text-red-600 cursor-pointer"
                      aria-label="Excluir item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resumo, Cupom e Frete */}
          <aside className="lg:col-span-4 border border-zinc-200 rounded-2xl p-6 bg-zinc-50 space-y-6">
            <h2 className="font-display text-lg font-bold text-zinc-950">Resumo da Compra</h2>

            <form onSubmit={handleApplyCoupon} className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 block">Cupom de desconto</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Ex: PASSO10"
                  className="flex-1 px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg font-mono uppercase"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
              {couponMessage && <p className="text-xs text-zinc-600">{couponMessage}</p>}
            </form>

            <form onSubmit={handleCalculateShipping} className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 block">Calcular frete (CEP)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  placeholder="00000-000"
                  maxLength={9}
                  className="flex-1 px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg font-mono"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-semibold border border-zinc-300 bg-white text-zinc-900 rounded-lg hover:bg-zinc-100 cursor-pointer"
                >
                  Calcular
                </button>
              </div>
              <p className="text-xs text-zinc-500">Frete grátis para compras acima de R$ 499,90.</p>
            </form>

            <div className="border-t border-zinc-200 pt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-600">Subtotal</span>
                <span className="font-mono tabular-nums font-medium">{formatBRL(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-lime-700">
                  <span>Desconto ({appliedCouponCode})</span>
                  <span className="font-mono tabular-nums font-semibold">-{formatBRL(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-600">Frete</span>
                <span className="font-mono tabular-nums font-medium">
                  {effectiveShipping === 0 ? 'Grátis' : formatBRL(effectiveShipping)}
                </span>
              </div>
              <div className="flex justify-between pt-3 border-t border-zinc-200 text-base font-bold text-zinc-950">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatBRL(total)}</span>
              </div>
            </div>

            <button
              disabled={hasStockError}
              onClick={() => navigate(`/checkout${appliedCouponCode ? `?cupom=${appliedCouponCode}` : ''}`)}
              className="w-full py-3.5 px-5 text-sm font-bold bg-lime-400 text-zinc-950 rounded-lg hover:bg-lime-300 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Finalizar compra</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </aside>
        </div>
      )}
    </main>
  );
}
