import { useState } from 'react';
import { X } from 'lucide-react';
import { ORDER_STATUS_LABELS, formatBRL, formatDateTime } from '../../lib/formatters';
import type { Order, UserProfile } from '../../types/store';

export function SellerCustomersTab({ customers, orders }: { customers: UserProfile[]; orders: Order[] }) {
  const [selectedCustomer, setSelectedCustomer] = useState<UserProfile | null>(null);

  const getCustomerOrders = (uid: string) => orders.filter((o) => o.userId === uid);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Dados pessoais protegidos por regras RBAC — visível somente para vendedores autorizados.
        </p>
        <span className="text-xs font-mono tabular-nums text-zinc-600">{customers.length} cliente(s)</span>
      </div>

      <div className="border border-zinc-200 bg-white rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
              <th className="py-3 px-4 font-semibold">Nome</th>
              <th className="py-3 px-4 font-semibold">E-mail</th>
              <th className="py-3 px-4 font-semibold">Cadastro</th>
              <th className="py-3 px-4 font-semibold text-right">Total de pedidos</th>
              <th className="py-3 px-4 font-semibold text-right">Total gasto</th>
              <th className="py-3 px-4 font-semibold text-right">Histórico</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-zinc-500">
                  Nenhum cliente cadastrado no banco de dados ainda.
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const cOrders = getCustomerOrders(c.uid);
                const cSpent = cOrders
                  .filter((o) => o.paymentStatus === 'approved' && o.status !== 'cancelado')
                  .reduce((s, o) => s + o.totalAmount, 0);
                return (
                  <tr key={c.uid} className="hover:bg-zinc-50">
                    <td className="py-3 px-4 font-semibold text-zinc-950">{c.name}</td>
                    <td className="py-3 px-4 text-zinc-600">{c.email}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-zinc-500">{formatDateTime(c.createdAt)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">{cOrders.length}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">{formatBRL(cSpent)}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedCustomer(c)}
                        className="px-2.5 py-1 border border-zinc-200 rounded hover:bg-zinc-100 cursor-pointer"
                      >
                        Ver compras
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 max-w-xl w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h3 className="font-display text-base font-bold">{selectedCustomer.name}</h3>
                <p className="text-zinc-500">{selectedCustomer.email}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-1 text-zinc-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {getCustomerOrders(selectedCustomer.uid).length === 0 ? (
                <p className="text-zinc-500 py-4 text-center">Nenhuma compra realizada por este cliente.</p>
              ) : (
                getCustomerOrders(selectedCustomer.uid).map((o) => (
                  <div key={o.id} className="p-3 border border-zinc-200 rounded-lg flex justify-between">
                    <div>
                      <p className="font-mono font-bold">{o.orderNumber}</p>
                      <p className="text-zinc-500">{ORDER_STATUS_LABELS[o.status]}</p>
                    </div>
                    <p className="font-mono tabular-nums font-bold">{formatBRL(o.totalAmount)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
