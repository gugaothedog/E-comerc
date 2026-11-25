import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ORDER_STATUS_LABELS, formatBRL } from '../../lib/formatters';
import type { InventoryVariant, Order, Product } from '../../types/store';

interface SellerReportsTabProps {
  orders: Order[];
  products: Product[];
  inventory: InventoryVariant[];
}

export function SellerReportsTab({ orders, products, inventory }: SellerReportsTabProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);

  const startMs = new Date(`${startDate}T00:00:00`).getTime();
  const endMs = new Date(`${endDate}T23:59:59`).getTime();

  const periodOrders = useMemo(
    () =>
      orders.filter((o) => {
        const ts = o.statusHistory?.[0]?.timestampMs || 0;
        return ts >= startMs && ts <= endMs;
      }),
    [orders, startMs, endMs]
  );

  const approvedOrders = periodOrders.filter(
    (o) => o.paymentStatus === 'approved' && o.status !== 'cancelado'
  );

  const totalRevenue = approvedOrders.reduce((s, o) => s + o.totalAmount, 0);
  const avgTicket = approvedOrders.length > 0 ? totalRevenue / approvedOrders.length : 0;

  // Faturamento mensal agrupado
  const monthlySeries = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of approvedOrders) {
      const ts = o.statusHistory?.[0]?.timestampMs || Date.now();
      const label = new Date(ts).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      map.set(label, (map.get(label) || 0) + o.totalAmount);
    }
    return Array.from(map.entries()).map(([mes, valor]) => ({ mes, valor: Number(valor.toFixed(2)) }));
  }, [approvedOrders]);

  // Ranking real de produtos mais vendidos e menos vendidos
  const productRanking = useMemo(() => {
    const soldMap = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const p of products) {
      soldMap.set(p.id, { name: p.name, qty: 0, revenue: 0 });
    }
    for (const o of approvedOrders) {
      for (const item of o.items) {
        const prev = soldMap.get(item.productId) || { name: item.productName, qty: 0, revenue: 0 };
        prev.qty += item.quantity;
        prev.revenue += item.unitPrice * item.quantity;
        soldMap.set(item.productId, prev);
      }
    }
    const list = Array.from(soldMap.values());
    return {
      best: [...list].sort((a, b) => b.qty - a.qty).slice(0, 5),
      worst: [...list].sort((a, b) => a.qty - b.qty).slice(0, 5),
    };
  }, [products, approvedOrders]);

  const totalAvailableUnits = inventory.reduce((s, v) => s + v.availableStock, 0);
  const totalReservedUnits = inventory.reduce((s, v) => s + v.reservedStock, 0);

  const exportCsv = () => {
    const header = 'Pedido,Data,Cliente,Status,Pagamento,Total\n';
    const rows = periodOrders
      .map((o) => {
        const dt = new Date(o.statusHistory?.[0]?.timestampMs || Date.now()).toISOString();
        return `"${o.orderNumber}","${dt}","${o.customerName}","${ORDER_STATUS_LABELS[o.status]}","${o.paymentStatus}",${o.totalAmount}`;
      })
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-passo-urbano-${startDate}-a-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="border border-zinc-200 bg-white rounded-xl p-4 flex flex-wrap items-end justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">Data inicial</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
          </div>
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">Data final</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
          </div>
        </div>

        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-950 text-white font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
        >
          <Download className="w-4 h-4 text-lime-400" />
          <span>Exportar CSV do período</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-zinc-200 bg-white rounded-xl p-4">
          <p className="text-xs text-zinc-500">Faturamento no período</p>
          <p className="font-mono tabular-nums text-xl font-bold mt-1">{formatBRL(totalRevenue)}</p>
        </div>
        <div className="border border-zinc-200 bg-white rounded-xl p-4">
          <p className="text-xs text-zinc-500">Ticket médio aprovado</p>
          <p className="font-mono tabular-nums text-xl font-bold mt-1">{formatBRL(avgTicket)}</p>
        </div>
        <div className="border border-zinc-200 bg-white rounded-xl p-4">
          <p className="text-xs text-zinc-500">Pedidos no período</p>
          <p className="font-mono tabular-nums text-xl font-bold mt-1">{periodOrders.length}</p>
        </div>
        <div className="border border-zinc-200 bg-white rounded-xl p-4">
          <p className="text-xs text-zinc-500">Estoque (Disp. / Reservado)</p>
          <p className="font-mono tabular-nums text-xl font-bold mt-1">{totalAvailableUnits} / {totalReservedUnits}</p>
        </div>
      </div>

      <div className="border border-zinc-200 bg-white rounded-xl p-5 space-y-4">
        <h3 className="font-display text-base font-bold text-zinc-950">Faturamento Mensal (Dados Reais)</h3>
        {monthlySeries.length === 0 ? (
          <p className="text-xs text-zinc-500 py-8 text-center">Sem faturamento aprovado no período selecionado.</p>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: unknown) => formatBRL(Number(v || 0))} />
                <Bar dataKey="valor" fill="#65a30d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        <div className="border border-zinc-200 bg-white rounded-xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold">Produtos Mais Vendidos</h3>
          {productRanking.best.map((item, idx) => (
            <div key={idx} className="flex justify-between border-b border-zinc-100 pb-2">
              <span className="font-medium text-zinc-800">{item.name}</span>
              <span className="font-mono tabular-nums font-bold">{item.qty} un. ({formatBRL(item.revenue)})</span>
            </div>
          ))}
        </div>

        <div className="border border-zinc-200 bg-white rounded-xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold">Produtos com Menor Giro</h3>
          {productRanking.worst.map((item, idx) => (
            <div key={idx} className="flex justify-between border-b border-zinc-100 pb-2">
              <span className="font-medium text-zinc-800">{item.name}</span>
              <span className="font-mono tabular-nums text-zinc-600">{item.qty} un. ({formatBRL(item.revenue)})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
