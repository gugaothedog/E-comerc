import { useState } from 'react';
import { Upload } from 'lucide-react';
import { saveStoreSettings, uploadMediaWithQuotaGuard } from '../../services/storeService';
import type { StoreSettings } from '../../types/store';

export function SellerSettingsTab({
  settings,
  storageBlocked,
}: {
  settings: StoreSettings;
  storageBlocked: boolean;
}) {
  const [form, setForm] = useState<Omit<StoreSettings, 'updatedAt'>>({ ...settings });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleUploadAsset = async (
    field: 'logoUrl' | 'bannerImageUrl',
    mediaType: 'logo' | 'banner',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const rec = await uploadMediaWithQuotaGuard({ file, mediaType });
      setForm((prev) => ({ ...prev, [field]: rec.url }));
      setNotice('Imagem atualizada no Firebase Storage.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro no envio.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await saveStoreSettings(form);
      setNotice('Configurações da loja salvas com sucesso.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-xs">
      {notice && <div className="p-3 font-medium bg-zinc-950 text-lime-400 rounded-lg">{notice}</div>}

      <div className="border border-zinc-200 bg-white rounded-xl p-6 space-y-4">
        <h3 className="font-display text-base font-bold text-zinc-950">Identidade & Contato</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-semibold block mb-1">Nome da loja</label>
            <input required value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </div>
          <div>
            <label className="font-semibold block mb-1">Razão social</label>
            <input value={form.legalName || ''} onChange={(e) => setForm({ ...form, legalName: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </div>
          <div>
            <label className="font-semibold block mb-1">CNPJ</label>
            <input value={form.cnpj || ''} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
          </div>
          <div>
            <label className="font-semibold block mb-1">E-mail de atendimento</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </div>
          <div>
            <label className="font-semibold block mb-1">Telefone</label>
            <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
          </div>
          <div>
            <label className="font-semibold block mb-1">WhatsApp</label>
            <input value={form.whatsapp || ''} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg font-mono" />
          </div>
          <div className="sm:col-span-2">
            <label className="font-semibold block mb-1">Endereço comercial</label>
            <input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </div>
          <div className="sm:col-span-2">
            <label className="font-semibold block mb-1">Descrição institucional</label>
            <textarea rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="border border-zinc-200 bg-white rounded-xl p-6 space-y-4">
        <h3 className="font-display text-base font-bold text-zinc-950">Logotipo, Banner & Redes Sociais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-semibold block mb-1">Logotipo (URL ou upload)</label>
            <div className="flex gap-2">
              <input value={form.logoUrl || ''} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg" />
              <label className={`inline-flex items-center gap-1 px-3 py-2 border border-zinc-300 rounded-lg cursor-pointer ${storageBlocked ? 'opacity-40 pointer-events-none' : ''}`}>
                <Upload className="w-3.5 h-3.5" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadAsset('logoUrl', 'logo', e)} />
              </label>
            </div>
          </div>
          <div>
            <label className="font-semibold block mb-1">Banner Principal (URL ou upload)</label>
            <div className="flex gap-2">
              <input value={form.bannerImageUrl || ''} onChange={(e) => setForm({ ...form, bannerImageUrl: e.target.value })} className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg" />
              <label className={`inline-flex items-center gap-1 px-3 py-2 border border-zinc-300 rounded-lg cursor-pointer ${storageBlocked ? 'opacity-40 pointer-events-none' : ''}`}>
                <Upload className="w-3.5 h-3.5" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadAsset('bannerImageUrl', 'banner', e)} />
              </label>
            </div>
          </div>
          <div>
            <label className="font-semibold block mb-1">Título do Banner</label>
            <input value={form.bannerTitle || ''} onChange={(e) => setForm({ ...form, bannerTitle: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </div>
          <div>
            <label className="font-semibold block mb-1">Subtítulo do Banner</label>
            <input value={form.bannerSubtitle || ''} onChange={(e) => setForm({ ...form, bannerSubtitle: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </div>
          <div>
            <label className="font-semibold block mb-1">Instagram</label>
            <input value={form.instagram || ''} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </div>
          <div>
            <label className="font-semibold block mb-1">TikTok</label>
            <input value={form.tiktok || ''} onChange={(e) => setForm({ ...form, tiktok: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="border border-zinc-200 bg-white rounded-xl p-6 space-y-4">
        <h3 className="font-display text-base font-bold text-zinc-950">Políticas & Entrega</h3>
        <div>
          <label className="font-semibold block mb-1">Informações de entrega</label>
          <textarea rows={2} value={form.shippingInfo || ''} onChange={(e) => setForm({ ...form, shippingInfo: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
        </div>
        <div>
          <label className="font-semibold block mb-1">Política de trocas</label>
          <textarea rows={2} value={form.exchangePolicy || ''} onChange={(e) => setForm({ ...form, exchangePolicy: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
        </div>
        <div>
          <label className="font-semibold block mb-1">Política de privacidade</label>
          <textarea rows={2} value={form.privacyPolicy || ''} onChange={(e) => setForm({ ...form, privacyPolicy: e.target.value })} className="w-full px-3 py-2 border border-zinc-200 rounded-lg" />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="px-6 py-3 bg-zinc-950 text-lime-400 font-bold rounded-lg hover:bg-zinc-800 cursor-pointer">
          {busy ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </form>
  );
}
