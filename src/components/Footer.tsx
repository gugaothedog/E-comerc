import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { navigate } from '../lib/router';

export function Footer() {
  const { settings, categories } = useStore();
  const [policyModal, setPolicyModal] = useState<'shipping' | 'exchange' | 'privacy' | null>(null);

  return (
    <footer className="bg-zinc-950 text-zinc-300 border-t border-zinc-800 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="space-y-3">
          <h3 className="font-display text-lg font-extrabold text-white tracking-tight">
            {settings.storeName}
          </h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {settings.description}
          </p>
          <p className="text-xs text-zinc-500">
            {settings.legalName} · CNPJ {settings.cnpj}
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white tracking-wide">Categorias</h4>
          <ul className="space-y-2 text-sm text-zinc-400">
            {categories.filter((c) => c.active).slice(0, 5).map((cat) => (
              <li key={cat.id}>
                <button
                  onClick={() => navigate(`/catalogo?categoria=${cat.id}`)}
                  className="hover:text-lime-400 transition-colors cursor-pointer"
                >
                  {cat.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white tracking-wide">Institucional & Políticas</h4>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <button onClick={() => setPolicyModal('shipping')} className="hover:text-lime-400 transition-colors cursor-pointer">
                Informações de entrega
              </button>
            </li>
            <li>
              <button onClick={() => setPolicyModal('exchange')} className="hover:text-lime-400 transition-colors cursor-pointer">
                Política de trocas
              </button>
            </li>
            <li>
              <button onClick={() => setPolicyModal('privacy')} className="hover:text-lime-400 transition-colors cursor-pointer">
                Privacidade e dados
              </button>
            </li>
            <li>
              <button onClick={() => navigate('/minha-conta')} className="hover:text-lime-400 transition-colors cursor-pointer">
                Acompanhar pedidos
              </button>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white tracking-wide">Atendimento</h4>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>{settings.email}</li>
            <li>{settings.phone}</li>
            {settings.whatsapp && <li>WhatsApp: {settings.whatsapp}</li>}
            <li className="text-xs text-zinc-500">{settings.address}</li>
            <li className="text-xs text-zinc-500 pt-1">
              {settings.instagram} · {settings.tiktok}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-zinc-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
          <span>© {new Date().getFullYear()} {settings.storeName}. Todos os direitos reservados.</span>
          <span>Pagamentos validados com segurança e reserva atômica de estoque.</span>
        </div>
      </div>

      {policyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4">
          <div className="bg-white text-zinc-950 rounded-xl max-w-lg w-full p-6 space-y-4 border border-zinc-200">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">
                {policyModal === 'shipping' && 'Informações de Entrega'}
                {policyModal === 'exchange' && 'Política de Trocas e Devoluções'}
                {policyModal === 'privacy' && 'Política de Privacidade'}
              </h3>
              <button
                onClick={() => setPolicyModal(null)}
                className="text-sm text-zinc-500 hover:text-zinc-950 px-2 py-1 cursor-pointer"
              >
                Fechar
              </button>
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-line">
              {policyModal === 'shipping' && settings.shippingInfo}
              {policyModal === 'exchange' && settings.exchangePolicy}
              {policyModal === 'privacy' && settings.privacyPolicy}
            </p>
          </div>
        </div>
      )}
    </footer>
  );
}
