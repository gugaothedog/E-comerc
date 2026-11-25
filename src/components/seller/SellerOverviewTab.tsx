import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DatabaseZap } from 'lucide-react';
import { useState } from 'react';
import { formatBRL } from '../../lib/formatters';
import { seedInitialCatalogToFirestore } from '../../services/storeService';
import type { InventoryVariant, Order, Product, UserProfile } from '../../types/store';

interface SellerOverviewTabProps {
  products: Product[];
  inventory: InventoryVariant[];
  orders: Order[];
  customers: UserProfile[];
  isFirestoreSeeded: boolean;
  onNavigateTab: (tab: string) => void;
}

export function SellerOverviewTab({
  products,
  inventory,
  orders,
  customers,
  isFirestoreSeeded,
  onNavigateTab,
}: SellerOverviewTabProps) {
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const validPaidOrders = orders.filter((o) => o.paymentStatus === 'approved' && o.status !== 'cancelado');

  const getOrderTimeMs = (o: Order) => o.statusHistory?.[0]?.timestampMs || 0;

  const todayRevenue = validPaidOrders
    .filter((o) => getOrderTimeMs(o) >= startOfDay)
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const monthRevenue = validPaidOrders
    .filter((o) => getOrderTimeMs(o) >= startOfMonth)
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const totalRevenue = validPaidOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  const pendingOrdersCount = orders.filter((o) => o.status === 'aguardando_pagamento').length;
  const processingOrdersCount = orders.filter(
    (o) => o.status === 'pagamento_aprovado' || o.status === 'em_preparacao' || o.status === 'enviado'
  ).length;

  // Produtos sem estoque e com estoque baixo calculados a partir das variações reais
  const productStockSummary = products.map((p) => {
    const vars = inventory.filter((v) => v.productId === p.id);
    const totalAvail = vars.reduce((s, v) => s + v.availableStock, 0);
    const hasLow = vars.some((v) => v.availableStock > 0 && v.availableStock <= (v.lowStockThreshold ?? 2));
    return { productId: p.id, totalAvail, hasLow };
  });

  const outOfStockProducts = productStockSummary.filter((s) => s.totalAvail === 0).length;
  const lowStockProducts = productStockSummary.filter((s) => s.totalAvail > 0 && s.hasLow).length;

  // Dados reais dos últimos 7 dias para o gráfico
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const dayStart = dayDate.getTime();
    const dayEnd = dayStart + 86_400_000;
    const dayOrders = validPaidOrders.filter((o) => {
      const t = getOrderTimeMs(o);
      return t >= dayStart && t < dayEnd;
    });
    return {
      day: dayDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      faturamento: Number(dayOrders.reduce((s, o) => s + o.totalAmount, 0).toFixed(2)),
      pedidos: dayOrders.length,
    };
  });

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      await seedInitialCatalogToFirestore();
      setSeedMessage('Catálogo inicial editável publicado no Cloud Firestore com sucesso.');
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : 'Erro ao inicializar catálogo.');
    } finally {
      setSeeding(false);
    }
  };

  const kpis = [
    { label: 'Vendas do dia', value: formatBRL(todayRevenue) },
    { label: 'Vendas do mês', value: formatBRL(monthRevenue) },
    { label: 'Faturamento total', value: formatBRL(totalRevenue) },
    { label: 'Quantidade de pedidos', value: String(orders.length) },
    { label: 'Pedidos pendentes', value: String(pendingOrdersCount) },
    { label: 'Pedidos em processamento', value: String(processingOrdersCount) },
    { label: 'Produtos cadastrados', value: String(products.length) },
    { label: 'Produtos sem estoque', value: String(outOfStockProducts) },
    { label: 'Produtos com estoque baixo', value: String(lowStockProducts) },
    { label: 'Clientes cadastrados', value: String(customers.length) },
  ];

  return (
    <div className="space-y-6">
      {!isFirestoreSeeded && (
        <div className="border border-zinc-300 bg-zinc-50 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-sm font-bold text-zinc-950">
              Catálogo ainda não gravado no Firestore
            </h3>
            <p className="text-xs text-zinc-600">
              Publique o catálogo inicial editável (6 produtos, marcas, categorias e variações) no Cloud Firestore para editar itens ou testar compras atômicas reais. Os indicadores de vendas permanecem zerados.
            </p>
          </div>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-zinc-950 text-lime-400 rounded-lg hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <DatabaseZap className="w-4 h-4" />
            <span>{seeding ? 'Publicando...' : 'Publicar catálogo inicial no Firestore'}</span>
          </button>
        </div>
      )}

      {seedMessage && (
        <div className="p-3.5 text-xs font-medium bg-zinc-950 text-lime-400 rounded-lg">{seedMessage}</div>
      )}

      {/* 10 cartões reais de indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="border border-zinc-200 bg-white rounded-xl p-4 space-y-1.5">
            <p className="text-xs text-zinc-500 truncate">{kpi.label}</p>
            <p className="font-mono tabular-nums text-xl font-bold text-zinc-950">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Gráficos reais */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 border border-zinc-200 bg-white rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-zinc-950">Faturamento Diário (Últimos 7 dias)</h3>
              <p className="text-xs text-zinc-500">Calculado exclusivamente a partir de pedidos com pagamento aprovado.</p>
            </div>
            <button
              onClick={() => onNavigateTab('reports')}
              className="text-xs font-semibold text-zinc-700 hover:text-zinc-950 underline cursor-pointer"
            >
              Ver relatórios completos
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#52525b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#52525b' }} />
                <Tooltip
                  formatter={(val: unknown) => formatBRL(Number(val || 0))}
                  contentStyle={{ borderRadius: 8, borderColor: '#e4e4e7', fontSize: 12 }}
                />
                <Bar dataKey="faturamento" name="Faturamento" fill="#18181b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 border border-zinc-200 bg-white rounded-xl p-5 space-y-4">
          <h3 className="font-display text-base font-bold text-zinc-950">Últimos Pedidos</h3>
          {orders.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-medium text-zinc-700">Nenhum pedido registrado ainda.</p>
              <p className="text-xs text-zinc-500">
                Quando um comprador iniciar o checkout, os pedidos aparecerão aqui em tempo real.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 5).map((o) => (
                <div
                  key={o.id}
                  onClick={() => onNavigateTab('orders')}
                  className="p-3 rounded-lg border border-zinc-100 hover:border-zinc-300 cursor-pointer flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-mono font-bold text-zinc-950">{o.orderNumber}</p>
                    <p className="text-zinc-500 truncate max-w-[140px]">{o.customerName}</p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="font-bold text-zinc-950">{formatBRL(o.totalAmount)}</p>
                    <p className="text-[11px] text-zinc-500">{o.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
