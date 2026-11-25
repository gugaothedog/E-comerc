import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, CreditCard, Lock, QrCode, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { getActiveBearerToken } from '../lib/sessionToken';
import { formatBRL } from '../lib/formatters';
import { navigate } from '../lib/router';
import {
  acquireAtomicCheckoutReservation,
  releaseReservationInFirestore,
  verifyAndConfirmGatewayPayment,
} from '../services/storeService';
import type { Address, Order, Reservation } from '../types/store';

export function CheckoutPage({ searchParams }: { searchParams: string }) {
  const { authUser, profile, privateInfo, resendVerification, refreshUserData } = useAuth();
  const { items, subtotal, clearCart } = useCart();
  const { coupons } = useStore();

  const urlParams = new URLSearchParams(searchParams);
  const couponCode = urlParams.get('cupom') || '';
  const activeCoupon = coupons.find((c) => c.active && c.code.toUpperCase() === couponCode.toUpperCase());
  const discountAmount =
    activeCoupon && subtotal >= activeCoupon.minSubtotal
      ? Number(((subtotal * activeCoupon.discountPercent) / 100).toFixed(2))
      : 0;
  const shippingCost = subtotal >= 499.9 ? 0 : 24.9;
  const totalAmount = Math.max(0, subtotal - discountAmount + shippingCost);

  const [address, setAddress] = useState<Address>({
    id: 'addr_checkout',
    label: 'Principal',
    recipient: profile?.name || '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: 'SP',
  });
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'checkout_pro'>('pix');
  const [idempotencyKey] = useState(() => `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(600);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estado do Gateway Mercado Pago
  const [mpConfigured, setMpConfigured] = useState<boolean | null>(null);
  const [mpPayload, setMpPayload] = useState<{
    paymentId?: string;
    qrCode?: string | null;
    qrCodeBase64?: string | null;
    initPoint?: string;
  } | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  useEffect(() => {
    if (privateInfo?.addresses?.length && !address.cep) {
      setAddress(privateInfo.addresses[0]);
    } else if (profile?.name && !address.recipient) {
      setAddress((prev) => ({ ...prev, recipient: profile.name }));
    }
  }, [privateInfo, profile]);

  useEffect(() => {
    fetch('/api/payments/mercadopago/config')
      .then((r) => r.json())
      .then((d) => setMpConfigured(Boolean(d.configured)))
      .catch(() => setMpConfigured(false));
  }, []);

  // Cronômetro regressivo da reserva de 10 minutos
  useEffect(() => {
    if (!reservation || reservation.status !== 'active' || paymentConfirmed) return;

    const tick = () => {
      const diffSec = Math.max(0, Math.floor((reservation.expiresAtMs - Date.now()) / 1000));
      setRemainingSeconds(diffSec);
      if (diffSec === 0) {
        void releaseReservationInFirestore({
          reservationId: reservation.id,
          orderId: order?.id,
          targetStatus: 'expired',
          reason: 'Tempo limite de 10 minutos expirado sem confirmação de pagamento.',
        });
        setReservation((prev) => (prev ? { ...prev, status: 'expired' } : null));
        setErrorMsg('Sua reserva de 10 minutos expirou e as unidades foram devolvidas ao estoque disponível.');
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [reservation, order?.id, paymentConfirmed]);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (!authUser) {
    return (
      <main className="max-w-xl mx-auto px-4 py-16 text-center space-y-5">
        <Lock className="w-10 h-10 mx-auto text-zinc-950" />
        <h1 className="font-display text-2xl font-bold">Entre para finalizar sua compra</h1>
        <p className="text-sm text-zinc-600">
          Para proteger a reserva atômica do seu pedido e acompanhar a entrega, acesse sua conta PASSO URBANO.
        </p>
        <button
          onClick={() => navigate('/login?redirect=/checkout')}
          className="px-6 py-3 text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
        >
          Entrar ou criar conta
        </button>
      </main>
    );
  }

  if (!authUser.emailVerified) {
    return (
      <main className="max-w-xl mx-auto px-4 py-16 text-center space-y-5">
        <AlertCircle className="w-10 h-10 mx-auto text-amber-600" />
        <h1 className="font-display text-2xl font-bold">Confirme seu e-mail para continuar</h1>
        <p className="text-sm text-zinc-600">
          Por segurança contra fraudes e reservas indevidas, enviamos um link de confirmação para <strong>{authUser.email}</strong>.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => resendVerification()}
            className="px-4 py-2.5 text-xs font-semibold border border-zinc-300 rounded-lg hover:bg-zinc-50 cursor-pointer"
          >
            Reenviar e-mail de verificação
          </button>
          <button
            onClick={() => refreshUserData()}
            className="px-4 py-2.5 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            Já confirmei, atualizar status
          </button>
        </div>
      </main>
    );
  }

  const handleReserveAndCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    setBusy(true);
    setErrorMsg(null);

    try {
      const result = await acquireAtomicCheckoutReservation({
        items,
        shippingAddress: address,
        subtotal,
        discountCode: activeCoupon?.code,
        discountAmount,
        shippingCost,
        totalAmount,
        paymentMethod: paymentMethod === 'pix' ? 'Mercado Pago PIX' : 'Mercado Pago Checkout Pro',
        idempotencyKey,
        actorUser: authUser,
      });

      setReservation(result.reservation);
      setOrder(result.order);
      clearCart();

      // Solicita criação do pagamento real no Mercado Pago via backend
      const token = await getActiveBearerToken().catch(() => null);
      if (token) {
        const mpResp = await fetch('/api/payments/mercadopago/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId: result.order.id,
            reservationId: result.reservation.id,
            items: result.order.items,
            payerEmail: authUser.email,
            shippingCost,
            discountAmount,
            method: paymentMethod,
          }),
        });
        const mpData = await mpResp.json();
        if (mpResp.ok) {
          setMpPayload(mpData);
        } else if (mpData.code === 'MERCADOPAGO_NOT_CONFIGURED') {
          setMpConfigured(false);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível reservar os produtos.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!order || !reservation) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await verifyAndConfirmGatewayPayment({
        orderId: order.id,
        reservationId: reservation.id,
        paymentId: mpPayload?.paymentId,
      });
      if (res.verified) {
        setPaymentConfirmed(true);
      } else {
        setErrorMsg(`Pagamento ainda não confirmado pelo Mercado Pago (situação atual: ${res.status}).`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao consultar confirmação do gateway.');
    } finally {
      setBusy(false);
    }
  };

  const handleManualCancelReservation = async () => {
    if (!reservation) return;
    setBusy(true);
    await releaseReservationInFirestore({
      reservationId: reservation.id,
      orderId: order?.id,
      targetStatus: 'cancelled',
      reason: 'Cancelamento voluntário do comprador durante o checkout.',
    });
    setReservation(null);
    setOrder(null);
    setBusy(false);
    navigate('/catalogo');
  };

  if (paymentConfirmed && order) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16">
        <div className="border border-zinc-200 rounded-2xl p-8 bg-white space-y-5 text-center">
          <CheckCircle2 className="w-12 h-12 text-lime-600 mx-auto" />
          <h1 className="font-display text-2xl font-bold text-zinc-950">
            Pedido {order.orderNumber} confirmado
          </h1>
          <p className="text-sm text-zinc-600">
            Pagamento validado oficialmente pelo Mercado Pago. Suas unidades reservadas foram convertidas em venda confirmada.
          </p>
          <button
            onClick={() => navigate('/minha-conta')}
            className="px-6 py-3 text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            Acompanhar pedido na Minha Conta
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="border-b border-zinc-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-950">Finalização de Compra</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Reserva atômica de estoque e pagamento verificado no servidor.
          </p>
        </div>

        {reservation && reservation.status === 'active' && (
          <div className="px-4 py-2.5 rounded-xl bg-zinc-950 text-white flex items-center gap-3">
            <Clock className="w-4 h-4 text-lime-400" />
            <div>
              <p className="text-[11px] text-zinc-400">Reserva ativa expira em</p>
              <p className="font-mono tabular-nums text-lg font-bold text-lime-400">
                {formatCountdown(remainingSeconds)}
              </p>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="border border-red-200 bg-red-50 text-red-800 rounded-xl p-4 flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <div>
            <p className="font-semibold">Atenção na verificação de estoque/pagamento</p>
            <p className="mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {!reservation ? (
        items.length === 0 ? (
          <div className="border border-zinc-200 rounded-2xl p-10 text-center space-y-4">
            <p className="text-sm text-zinc-600">Seu carrinho está vazio para iniciar um novo checkout.</p>
            <button
              onClick={() => navigate('/catalogo')}
              className="px-5 py-2.5 text-sm font-semibold bg-zinc-950 text-white rounded-lg cursor-pointer"
            >
              Voltar ao catálogo
            </button>
          </div>
        ) : (
          <form onSubmit={handleReserveAndCreatePayment} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-6">
              <div className="border border-zinc-200 rounded-2xl p-6 bg-white space-y-4">
                <h2 className="font-display text-lg font-bold text-zinc-950">1. Endereço de Entrega</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">Destinatário</label>
                    <input
                      required
                      value={address.recipient}
                      onChange={(e) => setAddress({ ...address, recipient: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">CEP</label>
                    <input
                      required
                      value={address.cep}
                      onChange={(e) => setAddress({ ...address, cep: e.target.value })}
                      placeholder="01310-100"
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">Estado (UF)</label>
                    <input
                      required
                      maxLength={2}
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg uppercase"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">Rua / Avenida</label>
                    <input
                      required
                      value={address.street}
                      onChange={(e) => setAddress({ ...address, street: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">Número</label>
                    <input
                      required
                      value={address.number}
                      onChange={(e) => setAddress({ ...address, number: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">Bairro</label>
                    <input
                      required
                      value={address.neighborhood}
                      onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">Cidade</label>
                    <input
                      required
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="border border-zinc-200 rounded-2xl p-6 bg-white space-y-4">
                <h2 className="font-display text-lg font-bold text-zinc-950">2. Forma de Pagamento (Mercado Pago)</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('pix')}
                    className={`p-4 rounded-xl border text-left flex items-center gap-3 cursor-pointer ${
                      paymentMethod === 'pix' ? 'border-zinc-950 bg-zinc-50' : 'border-zinc-200'
                    }`}
                  >
                    <QrCode className="w-5 h-5 text-lime-600 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-zinc-950">PIX Instantâneo</p>
                      <p className="text-xs text-zinc-500">Confirmação imediata via API</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('checkout_pro')}
                    className={`p-4 rounded-xl border text-left flex items-center gap-3 cursor-pointer ${
                      paymentMethod === 'checkout_pro' ? 'border-zinc-950 bg-zinc-50' : 'border-zinc-200'
                    }`}
                  >
                    <CreditCard className="w-5 h-5 text-zinc-950 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-zinc-950">Cartão / Checkout Pro</p>
                      <p className="text-xs text-zinc-500">Ambiente seguro Mercado Pago</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <aside className="lg:col-span-5 border border-zinc-200 rounded-2xl p-6 bg-zinc-50 space-y-5">
              <h2 className="font-display text-lg font-bold text-zinc-950">Resumo do Pedido</h2>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.variantId} className="flex justify-between text-xs gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">{item.productName}</p>
                      <p className="text-zinc-500">{item.color} · Tam. {item.size} · {item.quantity}x</p>
                    </div>
                    <span className="font-mono tabular-nums font-semibold">
                      {formatBRL(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-zinc-200 pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Subtotal</span>
                  <span className="font-mono tabular-nums">{formatBRL(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-lime-700">
                    <span>Desconto</span>
                    <span className="font-mono tabular-nums">-{formatBRL(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-600">Frete</span>
                  <span className="font-mono tabular-nums">{shippingCost === 0 ? 'Grátis' : formatBRL(shippingCost)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-zinc-200 font-bold text-base">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">{formatBRL(totalAmount)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 px-5 text-sm font-bold bg-lime-400 text-zinc-950 rounded-lg hover:bg-lime-300 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {busy ? 'Executando reserva atômica...' : 'Reservar estoque e pagar'}
              </button>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Ao clicar, todas as variações são verificadas e reservadas atomicamente por 10 minutos no servidor. Se qualquer item estiver esgotado, nada será cobrado ou reservado parcialmente.
              </p>
            </aside>
          </form>
        )
      ) : (
        /* Etapa de Pagamento com Reserva Ativa de 10 minutos */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 border border-zinc-200 rounded-2xl p-6 sm:p-8 bg-white space-y-6">
            <div className="space-y-1">
              <p className="text-xs font-mono text-zinc-500">
                Pedido {order?.orderNumber} · Operação {reservation.operationId}
              </p>
              <h2 className="font-display text-xl font-bold text-zinc-950">
                {reservation.status === 'active'
                  ? 'Unidades reservadas com exclusividade para você'
                  : 'Reserva encerrada'}
              </h2>
            </div>

            {mpConfigured === false ? (
              <div className="border border-amber-200 bg-amber-50 rounded-xl p-5 space-y-2 text-sm text-amber-950">
                <p className="font-bold">Credencial do Mercado Pago não configurada no servidor</p>
                <p className="text-xs leading-relaxed">
                  Sua reserva atômica real de 10 minutos foi criada no Firestore e no backend, bloqueando compras concorrentes. Para gerar QR Code PIX ou link Checkout Pro real, configure <code className="font-mono bg-amber-100 px-1 rounded">MERCADOPAGO_ACCESS_TOKEN</code> e <code className="font-mono bg-amber-100 px-1 rounded">MERCADOPAGO_WEBHOOK_SECRET</code> no painel Secrets.
                </p>
                <p className="text-xs text-amber-800">
                  Seguindo a política de confiabilidade da loja, nenhum pagamento é marcado como aprovado sem confirmação real do gateway.
                </p>
              </div>
            ) : mpPayload ? (
              <div className="border border-zinc-200 rounded-xl p-5 bg-zinc-50 space-y-4">
                {mpPayload.qrCodeBase64 && (
                  <div className="text-center space-y-3">
                    <img
                      src={`data:image/png;base64,${mpPayload.qrCodeBase64}`}
                      alt="QR Code PIX Mercado Pago"
                      className="w-48 h-48 mx-auto rounded-lg border border-zinc-200 bg-white p-2"
                    />
                    {mpPayload.qrCode && (
                      <input
                        readOnly
                        value={mpPayload.qrCode}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="w-full px-3 py-2 text-xs font-mono border border-zinc-200 rounded-lg bg-white"
                      />
                    )}
                  </div>
                )}
                {mpPayload.initPoint && (
                  <a
                    href={mpPayload.initPoint}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full text-center py-3 px-4 text-sm font-bold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800"
                  >
                    Abrir pagamento no Mercado Pago
                  </a>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              {reservation.status === 'active' && (
                <>
                  <button
                    onClick={handleVerifyPayment}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-lime-400 text-zinc-950 rounded-lg hover:bg-lime-300 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Verificar pagamento no gateway</span>
                  </button>
                  <button
                    onClick={handleManualCancelReservation}
                    disabled={busy}
                    className="px-4 py-2.5 text-sm font-semibold border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 cursor-pointer"
                  >
                    Cancelar e liberar estoque
                  </button>
                </>
              )}
            </div>
          </div>

          <aside className="lg:col-span-5 border border-zinc-200 rounded-2xl p-6 bg-zinc-50 space-y-4">
            <h3 className="font-display text-base font-bold text-zinc-950">Itens Reservados</h3>
            {reservation.items.map((i) => (
              <div key={i.variantId} className="flex justify-between text-xs border-b border-zinc-200 pb-2">
                <span>
                  {i.productName} ({i.color}, Tam. {i.size}) × {i.quantity}
                </span>
                <span className="font-mono tabular-nums font-semibold">{formatBRL(i.unitPrice * i.quantity)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-sm pt-2">
              <span>Total do pedido</span>
              <span className="font-mono tabular-nums">{formatBRL(order?.totalAmount || reservation.totalAmount)}</span>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
