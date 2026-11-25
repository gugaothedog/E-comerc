import { useState } from 'react';
import { Eye, X } from 'lucide-react';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatBRL,
  formatDateTime,
} from '../../lib/formatters';
import { updateOrderOperationalStatus } from '../../services/storeService';
import type { Order, OrderStatus } from '../../types/store';

export function SellerOrdersTab({ orders }: { orders: Order[] }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [nextStatus, setNextStatus] = useState<OrderStatus>('em_preparacao');
  const [trackingCode, setTrackingCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = orders.filter((o) => (!statusFilter ? true : o.status === statusFilter));

  const openOrder = (order: Order) => {
    setSelectedOrder(order);
    setNextStatus(order.status);
    setTrackingCode(order.trackingCode || '');
    setNote('');
    setNotice(null);
  };

  const handleUpdateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setBusy(true);
    setNotice(null);
    try {
      await updateOrderOperationalStatus({
        order: selectedOrder,
        nextStatus,
        trackingCode: trackingCode.trim() || undefined,
        note: note.trim() || `Estado atualizado para ${ORDER_STATUS_LABELS[nextStatus]}`,
      });
      setSelectedOrder(null);
      setNotice(`Pedido ${selectedOrder.orderNumber} atualizado com registro no histórico.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao atualizar pedido.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg"
        >
          <option value="">Todos os estados</option>
          {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <p className="text-xs text-zinc-500 font-mono tabular-nums">{filtered.length} pedido(s)</p>
      </div>

      {notice && (
        <div className="p-3 text-xs font-medium bg-zinc-950 text-lime-400 rounded-lg">{notice}</div>
      )}

      <div className="border border-zinc-200 bg-white rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
              <th className="py-3 px-4 font-semibold">Pedido</th>
              <th className="py-3 px-4 font-semibold">Comprador</th>
              <th className="py-3 px-4 font-semibold">Data</th>
              <th className="py-3 px-4 font-semibold">Itens</th>
              <th className="py-3 px-4 font-semibold text-right">Total</th>
              <th className="py-3 px-4 font-semibold">Pagamento</th>
              <th className="py-3 px-4 font-semibold">Estado</th>
              <th className="py-3 px-4 font-semibold text-right">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-zinc-500">
                  Nenhum pedido registrado para os critérios atuais.
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr key={o.id} className="hover:bg-zinc-50">
                  <td className="py-3 px-4 font-mono font-bold text-zinc-950">{o.orderNumber}</td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-zinc-900">{o.customerName}</p>
                    <p className="text-[11px] text-zinc-500">{o.customerEmail}</p>
                  </td>
                  <td className="py-3 px-4 text-zinc-600 font-mono tabular-nums">
                    {formatDateTime(o.createdAt || o.statusHistory?.[0]?.timestampMs)}
                  </td>
                  <td className="py-3 px-4 text-zinc-700">
                    {o.items.map((i) => `${i.productName} (${i.size}) ×${i.quantity}`).join(', ')}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-zinc-950">
                    {formatBRL(o.totalAmount)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold">{PAYMENT_STATUS_LABELS[o.paymentStatus]}</span>
                    <span className="block text-[11px] text-zinc-500">{o.paymentMethod}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-zinc-900">{ORDER_STATUS_LABELS[o.status]}</span>
                    {o.cancellationRequested && (
                      <span className="block text-[11px] text-amber-700 font-semibold">Cancelamento solicitado</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => openOrder(o)} className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-zinc-200 rounded-md hover:bg-zinc-100 cursor-pointer">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Gerenciar</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold">Pedido {selectedOrder.orderNumber}</h3>
                <p className="text-zinc-500">Cliente: {selectedOrder.customerName} ({selectedOrder.customerEmail})</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-1 text-zinc-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {notice && <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg">{notice}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200">
              <div>
                <p className="font-semibold text-zinc-800 mb-1">Endereço de entrega</p>
                <p>{selectedOrder.shippingAddress.recipient}</p>
                <p>{selectedOrder.shippingAddress.street}, {selectedOrder.shippingAddress.number}</p>
                <p>{selectedOrder.shippingAddress.neighborhood} · {selectedOrder.shippingAddress.city}/{selectedOrder.shippingAddress.state}</p>
                <p className="font-mono">CEP {selectedOrder.shippingAddress.cep}</p>
              </div>
              <div>
                <p className="font-semibold text-zinc-800 mb-1">Pagamento</p>
                <p>Método: {selectedOrder.paymentMethod}</p>
                <p>Situação: <strong>{PAYMENT_STATUS_LABELS[selectedOrder.paymentStatus]}</strong></p>
                <p className="font-mono">Total: {formatBRL(selectedOrder.totalAmount)}</p>
                {selectedOrder.paymentStatus !== 'approved' && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    Aprovação manual de pagamento bloqueada por segurança até confirmação do gateway.
                  </p>
                )}
              </div>
            </div>

            <form onSubmit={handleUpdateOrder} className="space-y-3 border-t border-zinc-200 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Estado operacional</label>
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k} disabled={k === 'pagamento_aprovado' && selectedOrder.paymentStatus !== 'approved'}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Código de rastreamento</label>
                  <input
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="Ex: BR123456789PU"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold block mb-1">Observação para o histórico do pedido</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex: Despachado via transportadora..."
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2.5 bg-zinc-950 text-lime-400 font-bold rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                {busy ? 'Salvando...' : 'Atualizar pedido'}
              </button>
            </form>

            <div className="border-t border-zinc-200 pt-4 space-y-2">
              <p className="font-semibold text-zinc-800">Histórico de movimentações</p>
              {selectedOrder.statusHistory.map((h, idx) => (
                <div key={idx} className="flex justify-between text-[11px] text-zinc-600 border-b border-zinc-100 pb-1">
                  <span><strong>{ORDER_STATUS_LABELS[h.status]}</strong> — {h.note} ({h.actor})</span>
                  <span className="font-mono tabular-nums">{formatDateTime(h.timestampMs)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
