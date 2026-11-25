import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { LogOut, MapPin, Package, Plus, Trash2, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatBRL, formatDateTime } from '../lib/formatters';
import { navigate } from '../lib/router';
import { getActiveBearerToken } from '../lib/sessionToken';
import { verifyAndConfirmGatewayPayment } from '../services/storeService';
import type { Address, Order } from '../types/store';

export function CustomerAccountPage() {
  const {
    firebaseUser,
    authUser,
    isSeller,
    hasPasswordProvider,
    profile,
    privateInfo,
    updateCustomerProfile,
    changeSitePassword,
    linkPasswordToGoogleAccount,
    logout,
    resendVerification,
    refreshUserData,
  } = useAuth();

  const [tab, setTab] = useState<'orders' | 'profile' | 'addresses'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(privateInfo?.phone || '');
  const [cpf, setCpf] = useState(privateInfo?.cpf || '');
  const [addresses, setAddresses] = useState<Address[]>(privateInfo?.addresses || []);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Novo endereço
  const [newAddr, setNewAddr] = useState<Omit<Address, 'id'>>({
    label: 'Casa',
    recipient: profile?.name || '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: 'SP',
  });

  // Modal de cancelamento
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    setName(profile?.name || '');
    setPhone(privateInfo?.phone || '');
    setCpf(privateInfo?.cpf || '');
    setAddresses(privateInfo?.addresses || []);
  }, [profile, privateInfo]);

  const loadServerOrders = async () => {
    try {
      const token = await getActiveBearerToken();
      const resp = await fetch('/api/store/orders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.orders)) setOrders(data.orders);
      }
    } catch {
      // Ignore if unauthenticated
    }
  };

  useEffect(() => {
    if (!authUser) return;
    if (!firebaseUser) {
      void loadServerOrders();
      const onRefresh = () => void loadServerOrders();
      window.addEventListener('passo-store-refresh', onRefresh);
      return () => window.removeEventListener('passo-store-refresh', onRefresh);
    }

    const q = query(collection(db, 'orders'), where('userId', '==', firebaseUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        list.sort((a, b) => (b.statusHistory?.[0]?.timestampMs || 0) - (a.statusHistory?.[0]?.timestampMs || 0));
        setOrders(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'orders')
    );
    return () => unsub();
  }, [authUser, firebaseUser]);

  if (!authUser) {
    return (
      <main className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold">Área do Cliente</h1>
        <p className="text-sm text-zinc-600">Entre na sua conta para acompanhar pedidos, pagamentos e endereços.</p>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-3 text-sm font-semibold bg-zinc-950 text-white rounded-lg cursor-pointer"
        >
          Entrar na conta
        </button>
      </main>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await updateCustomerProfile(name, phone, cpf, addresses);
      setFeedback('Dados pessoais atualizados com segurança.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao atualizar perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = [
      ...addresses,
      { ...newAddr, id: `addr_${Date.now()}` },
    ];
    setSaving(true);
    try {
      await updateCustomerProfile(name || profile?.name || '', phone, cpf, updated);
      setAddresses(updated);
      setNewAddr({
        label: 'Casa',
        recipient: name || '',
        cep: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: 'SP',
      });
      setFeedback('Endereço adicionado.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAddress = async (id: string) => {
    const updated = addresses.filter((a) => a.id !== id);
    await updateCustomerProfile(name || profile?.name || '', phone, cpf, updated);
    setAddresses(updated);
  };

  const handleRequestCancellation = async (order: Order) => {
    if (!cancelReason.trim()) return;
    try {
      const token = await getActiveBearerToken();
      await fetch(`/api/store/orders/${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cancellationRequested: true,
          cancellationReason: cancelReason.trim().slice(0, 300),
        }),
      });
      if (firebaseUser) {
        await updateDoc(doc(db, 'orders', order.id), {
          cancellationRequested: true,
          cancellationReason: cancelReason.trim().slice(0, 300),
          updatedAt: serverTimestamp(),
        });
      } else {
        await loadServerOrders();
      }
      setCancelOrderId(null);
      setCancelReason('');
      setFeedback(`Solicitação de cancelamento registrada para o pedido ${order.orderNumber}.`);
    } catch (error) {
      if (firebaseUser) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
      } else {
        setFeedback(error instanceof Error ? error.message : 'Erro ao solicitar cancelamento.');
      }
    }
  };

  const handleCheckPayment = async (order: Order) => {
    try {
      const res = await verifyAndConfirmGatewayPayment({
        orderId: order.id,
        reservationId: order.reservationId,
      });
      setFeedback(
        res.verified
          ? `Pagamento do pedido ${order.orderNumber} confirmado pelo Mercado Pago!`
          : `Situação do pagamento no gateway: ${res.status}.`
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao consultar pagamento.');
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-950">
            Olá, {profile?.name || authUser.displayName || 'Cliente'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">{authUser.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {isSeller && (
            <button
              onClick={() => navigate('/vendedor/dashboard')}
              className="px-4 py-2 text-xs font-bold bg-zinc-950 text-lime-400 rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              Painel do Vendedor
            </button>
          )}
          <button
            onClick={async () => {
              await logout();
              navigate('/');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold border border-zinc-300 rounded-lg hover:bg-zinc-50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da conta</span>
          </button>
        </div>
      </div>

      {!authUser.emailVerified && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
          <span>Seu e-mail ainda não foi verificado. Confirme para realizar compras e solicitações.</span>
          <div className="flex gap-2">
            <button onClick={() => resendVerification()} className="px-3 py-1.5 bg-white border border-amber-300 rounded-md font-semibold cursor-pointer">
              Reenviar link
            </button>
            <button onClick={() => refreshUserData()} className="px-3 py-1.5 bg-amber-900 text-white rounded-md font-semibold cursor-pointer">
              Já verifiquei
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div className="p-3.5 text-xs font-medium bg-zinc-950 text-lime-400 rounded-lg">
          {feedback}
        </div>
      )}

      <div className="flex gap-2 border-b border-zinc-200 pb-3 overflow-x-auto">
        <button
          onClick={() => setTab('orders')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
            tab === 'orders' ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Pedidos e Entregas ({orders.length})</span>
        </button>
        <button
          onClick={() => setTab('profile')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
            tab === 'profile' ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Meus Dados</span>
        </button>
        <button
          onClick={() => setTab('addresses')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap ${
            tab === 'addresses' ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Endereços ({addresses.length})</span>
        </button>
      </div>

      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="border border-zinc-200 rounded-xl p-10 text-center bg-zinc-50 space-y-3">
              <p className="text-sm font-semibold text-zinc-800">Você ainda não realizou nenhum pedido.</p>
              <button
                onClick={() => navigate('/catalogo')}
                className="px-5 py-2.5 text-xs font-semibold bg-zinc-950 text-white rounded-lg cursor-pointer"
              >
                Explorar tênis
              </button>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="border border-zinc-200 rounded-xl p-5 bg-white space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                  <div className="space-y-0.5">
                    <p className="font-mono text-sm font-bold text-zinc-950">Pedido {order.orderNumber}</p>
                    <p className="text-xs text-zinc-500">
                      Criado em {formatDateTime(order.createdAt || order.statusHistory?.[0]?.timestampMs)} · {order.paymentMethod}
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="text-base font-bold text-zinc-950">{formatBRL(order.totalAmount)}</p>
                    <p className="text-xs text-zinc-600">
                      {ORDER_STATUS_LABELS[order.status] || order.status} · Pagamento: {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-zinc-700">
                      <span>{item.productName} ({item.color} · Tam. {item.size}) × {item.quantity}</span>
                      <span className="font-mono tabular-nums">{formatBRL(item.unitPrice * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                {order.trackingCode && (
                  <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs flex items-center justify-between">
                    <span className="font-semibold text-zinc-700">Código de rastreamento:</span>
                    <span className="font-mono font-bold text-zinc-950">{order.trackingCode}</span>
                  </div>
                )}

                <div className="border-t border-zinc-100 pt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-zinc-500">
                    Entrega: {order.shippingAddress.street}, {order.shippingAddress.number} — {order.shippingAddress.city}/{order.shippingAddress.state}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {order.paymentStatus === 'pending' && order.status === 'aguardando_pagamento' && (
                      <button
                        onClick={() => handleCheckPayment(order)}
                        className="px-3 py-1.5 text-xs font-semibold bg-lime-400 text-zinc-950 rounded-md hover:bg-lime-300 cursor-pointer"
                      >
                        Consultar pagamento
                      </button>
                    )}
                    {order.status !== 'entregue' && order.status !== 'cancelado' && !order.cancellationRequested && (
                      <button
                        onClick={() => setCancelOrderId(order.id)}
                        className="px-3 py-1.5 text-xs font-semibold border border-zinc-300 text-zinc-700 rounded-md hover:bg-zinc-50 cursor-pointer"
                      >
                        Solicitar cancelamento
                      </button>
                    )}
                    {order.cancellationRequested && (
                      <span className="text-xs font-semibold text-amber-700">Cancelamento solicitado</span>
                    )}
                  </div>
                </div>

                {cancelOrderId === order.id && (
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg space-y-3">
                    <label className="text-xs font-semibold block">Motivo do cancelamento</label>
                    <input
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Ex: Numeração incorreta ou desistência..."
                      className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-md"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRequestCancellation(order)}
                        className="px-3 py-1.5 text-xs font-semibold bg-zinc-950 text-white rounded-md cursor-pointer"
                      >
                        Confirmar solicitação
                      </button>
                      <button
                        onClick={() => setCancelOrderId(null)}
                        className="px-3 py-1.5 text-xs border border-zinc-300 rounded-md cursor-pointer"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'profile' && (
        <div className="space-y-6 max-w-lg">
          <form onSubmit={handleSaveProfile} className="border border-zinc-200 rounded-xl p-6 bg-white space-y-4">
            <h2 className="font-display text-lg font-bold">Dados Pessoais (Protegidos)</h2>
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1">Nome completo</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1">Telefone / WhatsApp</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1">CPF</label>
              <input
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </form>

          {firebaseUser && !hasPasswordProvider && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setFeedback(null);
                try {
                  await linkPasswordToGoogleAccount(newPassword);
                  setNewPassword('');
                  setFeedback('Senha vinculada! Agora você também pode entrar usando e-mail e senha.');
                } catch (err) {
                  setFeedback(err instanceof Error ? err.message : 'Erro ao vincular senha.');
                } finally {
                  setSaving(false);
                }
              }}
              className="border border-zinc-200 rounded-xl p-6 bg-zinc-50 space-y-3"
            >
              <h3 className="font-display text-base font-bold">Definir senha para login por e-mail</h3>
              <p className="text-xs text-zinc-600">
                Sua conta usa login com Google. Defina uma senha abaixo caso também queira entrar digitando seu e-mail e senha.
              </p>
              <input
                required
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha (mínimo 6 caracteres)"
                className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                Vincular senha à minha conta
              </button>
            </form>
          )}

          {!firebaseUser && authUser.source === 'server' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setFeedback(null);
                try {
                  await changeSitePassword(currentPassword, newPassword);
                  setCurrentPassword('');
                  setNewPassword('');
                  setFeedback('Senha deste site atualizada com sucesso.');
                } catch (err) {
                  setFeedback(err instanceof Error ? err.message : 'Erro ao atualizar senha.');
                } finally {
                  setSaving(false);
                }
              }}
              className="border border-zinc-200 rounded-xl p-6 bg-zinc-50 space-y-3"
            >
              <h3 className="font-display text-base font-bold">Alterar senha neste site</h3>
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Senha atual"
                className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg"
              />
              <input
                required
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha (mínimo 6 caracteres)"
                className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                Atualizar senha
              </button>
            </form>
          )}
        </div>
      )}

      {tab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 space-y-3">
            <h2 className="font-display text-lg font-bold">Endereços Salvos</h2>
            {addresses.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum endereço cadastrado.</p>
            ) : (
              addresses.map((addr) => (
                <div key={addr.id} className="border border-zinc-200 rounded-xl p-4 bg-white flex justify-between items-start">
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-zinc-950">{addr.label} — {addr.recipient}</p>
                    <p className="text-zinc-600">{addr.street}, {addr.number} {addr.complement}</p>
                    <p className="text-zinc-500">{addr.neighborhood} · {addr.city}/{addr.state} · CEP {addr.cep}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveAddress(addr.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddAddress} className="lg:col-span-6 border border-zinc-200 rounded-xl p-6 bg-zinc-50 space-y-3">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Novo Endereço
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Apelido (ex: Casa)" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg" />
              <input required placeholder="Destinatário" value={newAddr.recipient} onChange={(e) => setNewAddr({ ...newAddr, recipient: e.target.value })} className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg" />
              <input required placeholder="CEP" value={newAddr.cep} onChange={(e) => setNewAddr({ ...newAddr, cep: e.target.value })} className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg font-mono" />
              <input required placeholder="UF" maxLength={2} value={newAddr.state} onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value.toUpperCase() })} className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg uppercase" />
              <input required placeholder="Rua / Av." value={newAddr.street} onChange={(e) => setNewAddr({ ...newAddr, street: e.target.value })} className="col-span-2 px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg" />
              <input required placeholder="Número" value={newAddr.number} onChange={(e) => setNewAddr({ ...newAddr, number: e.target.value })} className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg" />
              <input required placeholder="Bairro" value={newAddr.neighborhood} onChange={(e) => setNewAddr({ ...newAddr, neighborhood: e.target.value })} className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg" />
              <input required placeholder="Cidade" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} className="col-span-2 px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg" />
            </div>
            <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg cursor-pointer">
              Salvar endereço
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
