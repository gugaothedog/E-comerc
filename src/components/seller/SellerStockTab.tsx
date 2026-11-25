import { useState } from 'react';
import { AlertTriangle, Edit3, X } from 'lucide-react';
import { formatDateTime } from '../../lib/formatters';
import { adjustSellerVariantStock } from '../../services/storeService';
import type { InventoryVariant, StockMovement } from '../../types/store';

interface SellerStockTabProps {
  inventory: InventoryVariant[];
  movements: StockMovement[];
}

export function SellerStockTab({ inventory, movements }: SellerStockTabProps) {
  const [filterLow, setFilterLow] = useState(false);
  const [search, setSearch] = useState('');
  const [editingVar, setEditingVar] = useState<InventoryVariant | null>(null);
  const [newQty, setNewQty] = useState('0');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = inventory.filter((v) => {
    if (filterLow && v.availableStock > (v.lowStockThreshold ?? 2)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        v.productName.toLowerCase().includes(q) ||
        v.sku.toLowerCase().includes(q) ||
        v.size.toLowerCase().includes(q) ||
        v.color.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openAdjust = (v: InventoryVariant) => {
    setEditingVar(v);
    setNewQty(String(v.availableStock));
    setReason('');
    setNotice(null);
  };

  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVar) return;
    setBusy(true);
    setNotice(null);
    try {
      await adjustSellerVariantStock({
        variant: editingVar,
        newAvailableStock: Math.max(0, Math.floor(Number(newQty))),
        reason: reason.trim() || 'Ajuste de inventário no painel',
      });
      setEditingVar(null);
      setNotice(`Estoque de ${editingVar.productName} (${editingVar.size}) atualizado preservando reservas ativas.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao ajustar estoque.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar SKU, produto, cor ou tamanho..."
            className="w-64 px-3 py-2 text-xs bg-white border border-zinc-200 rounded-lg"
          />
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
            <input type="checkbox" checked={filterLow} onChange={(e) => setFilterLow(e.target.checked)} />
            Somente estoque baixo / zerado
          </label>
        </div>
        <span className="text-xs text-zinc-500 font-mono tabular-nums">{filtered.length} variação(ões)</span>
      </div>

      {notice && (
        <div className="p-3 text-xs font-medium bg-zinc-950 text-lime-400 rounded-lg">{notice}</div>
      )}

      <div className="border border-zinc-200 bg-white rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
              <th className="py-3 px-4 font-semibold">Produto</th>
              <th className="py-3 px-4 font-semibold">SKU</th>
              <th className="py-3 px-4 font-semibold">Cor</th>
              <th className="py-3 px-4 font-semibold">Tam.</th>
              <th className="py-3 px-4 font-semibold text-right">Disponível</th>
              <th className="py-3 px-4 font-semibold text-right">Reservado (10m)</th>
              <th className="py-3 px-4 font-semibold text-right">Total Físico</th>
              <th className="py-3 px-4 font-semibold text-right">Ajustar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.map((v) => {
              const totalFisico = v.availableStock + v.reservedStock;
              const isLow = v.availableStock <= (v.lowStockThreshold ?? 2);
              return (
                <tr key={v.id} className="hover:bg-zinc-50">
                  <td className="py-2.5 px-4 font-semibold text-zinc-950">{v.productName}</td>
                  <td className="py-2.5 px-4 font-mono text-zinc-600">{v.sku}</td>
                  <td className="py-2.5 px-4 text-zinc-600">{v.color}</td>
                  <td className="py-2.5 px-4 font-mono font-semibold">{v.size}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold">
                    <span className={v.availableStock === 0 ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-zinc-950'}>
                      {v.availableStock}
                    </span>
                    {isLow && <AlertTriangle className="inline w-3.5 h-3.5 ml-1 text-amber-600" />}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-700">
                    {v.reservedStock}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                    {totalFisico}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button onClick={() => openAdjust(v)} className="inline-flex items-center gap-1 px-2.5 py-1 border border-zinc-200 rounded hover:bg-zinc-100 cursor-pointer">
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Corrigir</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Histórico de movimentações */}
      <div className="border border-zinc-200 bg-white rounded-xl p-5 space-y-3">
        <h3 className="font-display text-base font-bold text-zinc-950">Histórico de Movimentações de Estoque</h3>
        {movements.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhuma movimentação registrada no banco ainda.</p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 px-3">Data</th>
                  <th className="py-2 px-3">SKU / Tam.</th>
                  <th className="py-2 px-3">Tipo</th>
                  <th className="py-2 px-3 text-right">Delta</th>
                  <th className="py-2 px-3">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {movements.slice(0, 50).map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 px-3 font-mono tabular-nums text-zinc-500">{formatDateTime(m.createdAt)}</td>
                    <td className="py-2 px-3 font-mono">{m.sku} ({m.size || '-'})</td>
                    <td className="py-2 px-3 font-semibold">{m.type}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-bold">
                      {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                    </td>
                    <td className="py-2 px-3 text-zinc-600">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingVar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Ajustar Estoque Disponível</h3>
              <button onClick={() => setEditingVar(null)} className="p-1 text-zinc-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-zinc-600">
              <strong>{editingVar.productName}</strong> — {editingVar.color} · Tam. <span className="font-mono">{editingVar.size}</span>
            </p>
            <p className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700">
              Unidades atualmente reservadas em checkouts ativos: <strong className="font-mono">{editingVar.reservedStock}</strong> (preservadas automaticamente).
            </p>
            <form onSubmit={handleSaveAdjust} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Nova quantidade disponível</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Motivo da movimentação</label>
                <input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: Reposição de fornecedor / Balanço físico"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingVar(null)} className="px-4 py-2 border border-zinc-300 rounded-lg cursor-pointer">Cancelar</button>
                <button type="submit" disabled={busy} className="px-4 py-2 bg-zinc-950 text-lime-400 font-bold rounded-lg cursor-pointer">
                  {busy ? 'Salvando...' : 'Confirmar ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
