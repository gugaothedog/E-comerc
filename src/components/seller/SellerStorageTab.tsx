import { useState } from 'react';
import { AlertTriangle, Database, HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { getActiveBearerToken } from '../../lib/sessionToken';
import { formatBytes, formatDateTime } from '../../lib/formatters';
import { deleteStorageMediaRecord, uploadMediaWithQuotaGuard } from '../../services/storeService';
import type { StorageFileRecord } from '../../types/store';

interface SellerStorageTabProps {
  storageFiles: StorageFileRecord[];
  storageLimitBytes: number;
  firestoreStats: {
    productsCount: number;
    inventoryCount: number;
    ordersCount: number;
    customersCount: number;
    movementsCount: number;
    reviewsCount: number;
    estimatedBytes: number;
  };
  onReconciled?: () => void;
}

const FIRESTORE_FREE_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GiB
const STORAGE_FREE_REFERENCE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB-mês

export function SellerStorageTab({
  storageFiles,
  storageLimitBytes,
  firestoreStats,
  onReconciled,
}: SellerStorageTabProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Cálculos A) Firestore
  const fsTotalRecords =
    firestoreStats.productsCount +
    firestoreStats.inventoryCount +
    firestoreStats.ordersCount +
    firestoreStats.customersCount +
    firestoreStats.movementsCount +
    firestoreStats.reviewsCount;
  const fsPercent = Math.min(100, Number(((firestoreStats.estimatedBytes / FIRESTORE_FREE_QUOTA_BYTES) * 100).toFixed(4)));

  // Cálculos B) Firebase Storage (limite operacional de 4 GB)
  const imageFiles = storageFiles.filter((f) => f.mediaType !== 'video');
  const videoFiles = storageFiles.filter((f) => f.mediaType === 'video');
  const imageBytes = imageFiles.reduce((s, f) => s + f.sizeBytes, 0);
  const videoBytes = videoFiles.reduce((s, f) => s + f.sizeBytes, 0);
  const usedBytes = imageBytes + videoBytes;
  const availableBytes = Math.max(0, storageLimitBytes - usedBytes);
  const usagePercent = Math.min(100, Number(((usedBytes / storageLimitBytes) * 100).toFixed(2)));
  const isBlocked = usedBytes >= storageLimitBytes;

  const alertLevel =
    usagePercent >= 100 ? '100%' : usagePercent >= 90 ? '90%' : usagePercent >= 80 ? '80%' : 'normal';

  const handleReconcile = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const token = await getActiveBearerToken();
      await fetch('/api/storage/reconcile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          limitBytes: storageLimitBytes,
          files: storageFiles.map((f) => ({
            id: f.id,
            name: f.name,
            mediaType: f.mediaType,
            sizeBytes: f.sizeBytes,
            url: f.url,
            path: f.path,
            uploadedBy: f.uploadedBy,
            createdAtMs: Date.now(),
          })),
        }),
      });
      setNotice('Reconciliação de espaço concluída entre Firestore e o controlador de cota no backend.');
      onReconciled?.();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro na reconciliação.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFile = async (file: StorageFileRecord) => {
    setBusy(true);
    setNotice(null);
    try {
      await deleteStorageMediaRecord(file);
      setNotice(`Arquivo "${file.name}" excluído. Espaço liberado: ${formatBytes(file.sizeBytes)}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao excluir arquivo.');
    } finally {
      setBusy(false);
    }
  };

  const handleReplaceFile = async (oldFile: StorageFileRecord, e: React.ChangeEvent<HTMLInputElement>) => {
    const newFile = e.target.files?.[0];
    if (!newFile) return;
    setBusy(true);
    setNotice(null);
    try {
      await deleteStorageMediaRecord(oldFile);
      await uploadMediaWithQuotaGuard({
        file: newFile,
        mediaType: oldFile.mediaType,
        productId: oldFile.productId,
      });
      setNotice(`Arquivo "${oldFile.name}" substituído por "${newFile.name}".`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao substituir arquivo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {notice && <div className="p-3.5 text-xs font-medium bg-zinc-950 text-lime-400 rounded-lg">{notice}</div>}

      {/* A) FIRESTORE — BANCO DE DADOS */}
      <section className="border border-zinc-200 bg-white rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-zinc-100 text-zinc-950">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-zinc-950">
                A) Cloud Firestore — Banco de Dados
              </h3>
              <p className="text-xs text-zinc-500">
                Referência da cota gratuita: 1 GiB armazenado (separado dos arquivos de mídia).
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-zinc-100 text-zinc-800">
            Cota ref.: 1 GiB
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-zinc-500">Estimativa utilizada</p>
            <p className="font-mono tabular-nums text-base font-bold mt-1">{formatBytes(firestoreStats.estimatedBytes)}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-zinc-500">Registros totais</p>
            <p className="font-mono tabular-nums text-base font-bold mt-1">{fsTotalRecords}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-zinc-500">Produtos / Variações</p>
            <p className="font-mono tabular-nums text-base font-bold mt-1">
              {firestoreStats.productsCount} / {firestoreStats.inventoryCount}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-zinc-500">Pedidos / Movim.</p>
            <p className="font-mono tabular-nums text-base font-bold mt-1">
              {firestoreStats.ordersCount} / {firestoreStats.movementsCount}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-600">Consumo estimado do banco</span>
            <span className="font-mono tabular-nums font-semibold">{fsPercent}% de 1 GiB</span>
          </div>
          <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-950 rounded-full" style={{ width: `${Math.max(1, fsPercent)}%` }} />
          </div>
          {fsPercent >= 80 && (
            <p className="text-xs text-amber-700 font-semibold pt-1">
              Alerta: consumo estimado do Firestore acima de 80% da referência gratuita de 1 GiB.
            </p>
          )}
        </div>
      </section>

      {/* B) FIREBASE STORAGE — ARQUIVOS (LIMITE OPERACIONAL 4 GB) */}
      <section className="border border-zinc-200 bg-white rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-zinc-950 text-lime-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-zinc-950">
                B) Firebase Storage — Arquivos de Mídia
              </h3>
              <p className="text-xs text-zinc-500">
                Referência sem custo no plano Blaze: 5 GB-mês · Trava operacional configurada pela aplicação: <strong>{formatBytes(storageLimitBytes)} (4 GB)</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={handleReconcile}
            disabled={busy}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border border-zinc-300 rounded-lg hover:bg-zinc-50 cursor-pointer self-start"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reconciliar com servidor</span>
          </button>
        </div>

        {/* Alertas de 80%, 90% e 100% */}
        {alertLevel !== 'normal' && (
          <div
            className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
              alertLevel === '100%'
                ? 'bg-red-50 border-red-300 text-red-900'
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                {alertLevel === '100%'
                  ? 'Limite operacional de 4 GB atingido (100%): novos uploads bloqueados!'
                  : `Alerta de capacidade (${alertLevel}): armazenamento atingiu ${usagePercent}% do limite operacional de 4 GB.`}
              </p>
              <p>
                {alertLevel === '100%'
                  ? 'Por proteção da loja, novos envios de imagens e vídeos estão bloqueados. Nenhum arquivo é removido automaticamente: exclua ou substitua arquivos abaixo para liberar espaço.'
                  : 'Considere revisar arquivos pesados ou substituir vídeos antigos antes de atingir o bloqueio em 100%.'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-zinc-500">Espaço por imagens</p>
            <p className="font-mono tabular-nums text-base font-bold mt-1">{formatBytes(imageBytes)}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-zinc-500">Espaço por vídeos</p>
            <p className="font-mono tabular-nums text-base font-bold mt-1">{formatBytes(videoBytes)}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-zinc-500">Total de arquivos</p>
            <p className="font-mono tabular-nums text-base font-bold mt-1">{storageFiles.length}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-zinc-500">Espaço disponível</p>
            <p className="font-mono tabular-nums text-base font-bold mt-1">{formatBytes(availableBytes)}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
            <p className="text-zinc-500">Percentual de uso</p>
            <p className={`font-mono tabular-nums text-base font-bold mt-1 ${isBlocked ? 'text-red-600' : 'text-zinc-950'}`}>
              {usagePercent}%
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-600">
              {formatBytes(usedBytes)} de {formatBytes(storageLimitBytes)} (Ref. Blaze: {formatBytes(STORAGE_FREE_REFERENCE_BYTES)})
            </span>
            <span className="font-mono tabular-nums font-bold">{usagePercent}%</span>
          </div>
          <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePercent >= 100 ? 'bg-red-600' : usagePercent >= 80 ? 'bg-amber-500' : 'bg-lime-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(usagePercent > 0 ? 2 : 0, usagePercent))}%` }}
            />
          </div>
        </div>

        {/* Lista de arquivos enviados com opção de substituir ou excluir */}
        <div className="border-t border-zinc-200 pt-4 space-y-3">
          <h4 className="text-xs font-bold text-zinc-800">Arquivos armazenados ({storageFiles.length})</h4>
          {storageFiles.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4">
              Nenhum arquivo enviado ao Firebase Storage ainda. Os envios feitos na aba Produtos ou Configurações serão contabilizados aqui com seus tamanhos reais em bytes.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-2 px-3">Arquivo</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3 text-right">Tamanho</th>
                    <th className="py-2 px-3">Enviado em</th>
                    <th className="py-2 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {storageFiles.map((file) => (
                    <tr key={file.id}>
                      <td className="py-2.5 px-3 font-medium text-zinc-950 truncate max-w-[220px]">{file.name}</td>
                      <td className="py-2.5 px-3 text-zinc-600">{file.mediaType}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatBytes(file.sizeBytes)}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-500">{formatDateTime(file.createdAt)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <label className="px-2.5 py-1 border border-zinc-200 rounded hover:bg-zinc-100 cursor-pointer">
                            Substituir
                            <input type="file" className="hidden" onChange={(e) => handleReplaceFile(file, e)} />
                          </label>
                          <button
                            onClick={() => handleDeleteFile(file)}
                            disabled={busy}
                            className="p-1 text-zinc-500 hover:text-red-600 cursor-pointer"
                            title="Excluir arquivo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
