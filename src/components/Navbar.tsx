import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { navigate } from '../lib/router';

interface NavbarProps {
  currentPath: string;
  currentSearch?: string;
}

export function Navbar({ currentPath, currentSearch = '' }: NavbarProps) {
  const { itemCount, setDrawerOpen } = useCart();
  const { authUser, isSeller } = useAuth();
  const { settings } = useStore();
  const [promoDismissed, setPromoDismissed] = useState(false);

  const isOffersActive =
    currentPath === '/catalogo' && new URLSearchParams(currentSearch).get('ofertas') === '1';
  const isCatalogActive = currentPath.startsWith('/catalogo') && !isOffersActive;

  const accountTarget = authUser ? (isSeller ? '/vendedor/dashboard' : '/minha-conta') : '/login';
  const accountLabel = authUser ? (isSeller ? 'Painel' : 'Minha Conta') : 'Entrar';
  const isAccountActive =
    currentPath === '/minha-conta' || currentPath === '/login' || currentPath.startsWith('/vendedor');

  return (
    <div className="sticky top-0 z-40 bg-white">
      {!promoDismissed && (
        <div className="bg-zinc-950 text-white px-4 h-9 flex items-center justify-center relative text-xs">
          <p className="truncate pr-6">
            Frete grátis acima de <span className="font-mono tabular-nums text-lime-400 font-semibold">R$ 499,90</span> · Use <span className="font-mono font-semibold text-lime-400">PASSO10</span> para 10% OFF
          </p>
          <button
            onClick={() => setPromoDismissed(true)}
            aria-label="Fechar aviso promocional"
            className="absolute right-3 text-zinc-400 hover:text-white text-xs px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Contrato Top Bar: exatas 3 zonas separadas por gap-8 */}
      <header className="border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zona 1: Wordmark em linha única */}
          <button
            onClick={() => navigate('/')}
            className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt={settings.storeName} className="h-7 w-auto object-contain" />
            ) : null}
            <span>{settings.storeName || 'PASSO URBANO'}</span>
          </button>

          {/* Zona 2: 4 links limpos em linha única */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
            <button
              onClick={() => navigate('/')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors hover:text-zinc-950 cursor-pointer ${currentPath === '/' ? 'text-zinc-950 underline underline-offset-4 decoration-lime-500 decoration-2' : ''}`}
            >
              Início
            </button>
            <button
              onClick={() => navigate('/catalogo')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors hover:text-zinc-950 cursor-pointer ${isCatalogActive ? 'text-zinc-950 underline underline-offset-4 decoration-lime-500 decoration-2' : ''}`}
            >
              Catálogo
            </button>
            <button
              onClick={() => navigate('/catalogo?ofertas=1')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors hover:text-zinc-950 cursor-pointer ${isOffersActive ? 'text-zinc-950 underline underline-offset-4 decoration-lime-500 decoration-2' : ''}`}
            >
              Ofertas
            </button>
            <button
              onClick={() => navigate(accountTarget)}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors hover:text-zinc-950 cursor-pointer ${isAccountActive ? 'text-zinc-950 underline underline-offset-4 decoration-lime-500 decoration-2' : ''}`}
            >
              {accountLabel}
            </button>
          </nav>

          {/* Zona 3: 1 ação primária */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-lime-400" />
              <span>Sacola</span>
              <span className="font-mono tabular-nums text-lime-400">({itemCount})</span>
            </button>
          </div>
        </div>

        {/* Navegação rápida mobile */}
        <div className="md:hidden border-t border-zinc-100 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-zinc-600">
          <button
            onClick={() => navigate('/')}
            className={`whitespace-nowrap shrink-0 hover:text-zinc-950 ${currentPath === '/' ? 'text-zinc-950 font-semibold underline underline-offset-4 decoration-lime-500' : ''}`}
          >
            Início
          </button>
          <button
            onClick={() => navigate('/catalogo')}
            className={`whitespace-nowrap shrink-0 hover:text-zinc-950 ${isCatalogActive ? 'text-zinc-950 font-semibold underline underline-offset-4 decoration-lime-500' : ''}`}
          >
            Catálogo
          </button>
          <button
            onClick={() => navigate('/catalogo?ofertas=1')}
            className={`whitespace-nowrap shrink-0 hover:text-zinc-950 ${isOffersActive ? 'text-zinc-950 font-semibold underline underline-offset-4 decoration-lime-500' : ''}`}
          >
            Ofertas
          </button>
          <button
            onClick={() => navigate(accountTarget)}
            className={`whitespace-nowrap shrink-0 hover:text-zinc-950 ${isAccountActive ? 'text-zinc-950 font-semibold underline underline-offset-4 decoration-lime-500' : ''}`}
          >
            {accountLabel}
          </button>
        </div>
      </header>
    </div>
  );
}
