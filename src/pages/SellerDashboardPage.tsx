import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  BarChart3,
  Boxes,
  ExternalLink,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Tags,
  Users,
  X,
} from 'lucide-react';
import { SellerCustomersTab } from '../components/seller/SellerCustomersTab';
import { SellerOrdersTab } from '../components/seller/SellerOrdersTab';
import { SellerOverviewTab } from '../components/seller/SellerOverviewTab';
import { SellerProductsTab } from '../components/seller/SellerProductsTab';
import { SellerReportsTab } from '../components/seller/SellerReportsTab';
import { SellerSettingsTab } from '../components/seller/SellerSettingsTab';
import { SellerStockTab } from '../components/seller/SellerStockTab';
import { SellerStorageTab } from '../components/seller/SellerStorageTab';
import { SellerTaxonomyTab } from '../components/seller/SellerTaxonomyTab';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { db } from '../lib/firebase';
import { navigate } from '../lib/router';
import { getActiveBearerToken } from '../lib/sessionToken';
import type { Order, StockMovement, StorageFileRecord, UserProfile } from '../types/store';

type SellerTabId =
  | 'overview'
  | 'products'
  | 'orders'
  | 'stock'
  | 'customers'
  | 'taxonomy'
  | 'reports'
  | 'storage'
  | 'settings';

const NAV_ITEMS: Array<{ id: SellerTabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'orders', label: 'Pedidos', icon: ShoppingCart },
  { id: 'stock', label: 'Estoque', icon: Boxes },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'taxonomy', label: 'Categorias & Marcas', icon: Tags },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'storage', label: 'Armazenamento', icon: HardDrive },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export function SellerDashboardPage() {
  const { firebaseUser, authUser, profile, isSeller, loading, logout } = useAuth();
  const { products, categories, brands, inventory, coupons, reviews, settings, isFirestoreSeeded } = useStore();

  const [activeTab, setActiveTab] = useState<SellerTabId>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [storageFiles, setStorageFiles] = useState<StorageFileRecord[]>([]);

  useEffect(() => {
    if (!loading && (!authUser || !isSeller)) {
      navigate('/login');
    }
  }, [loading, authUser, isSeller]);

  useEffect(() => {
    if (!authUser || !isSeller) return;

    const fetchServerSellerData = async () => {
      try {
        const token = await getActiveBearerToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [ordRes, custRes, invRes, storRes] = await Promise.all([
          fetch('/api/store/orders', { headers }),
          fetch('/api/store/customers', { headers }),
          fetch('/api/inventory/snapshot'),
          fetch('/api/storage/status', { headers }),
        ]);
        if (ordRes.ok) {
          const d = await ordRes.json();
          if (Array.isArray(d.orders)) setOrders(d.orders);
        }
        if (custRes.ok) {
          const d = await custRes.json();
          if (Array.isArray(d.customers)) setCustomers(d.customers);
        }
        if (invRes.ok) {
          const d = await invRes.json();
          if (Array.isArray(d.movements)) {
            setMovements(
              d.movements.map((m: Record<string, unknown>) => ({
                id: String(m.id),
                variantId: String(m.variantId),
                productId: '',
                sku: String(m.sku || ''),
                color: String(m.color || ''),
                size: String(m.size || ''),
                type: m.type as StockMovement['type'],
                quantityDelta: Number(m.quantityDelta || 0),
                previousAvailable: Number(m.previousAvailable || 0),
                newAvailable: Number(m.newAvailable || 0),
                previousReserved: Number(m.previousReserved || 0),
                newReserved: Number(m.newReserved || 0),
                reason: String(m.reason || ''),
                actorUid: String(m.actorUid || ''),
                operationId: String(m.operationId || ''),
                createdAt: m.createdAtMs,
              }))
            );
          }
        }
        if (storRes.ok) {
          const d = await storRes.json();
          if (Array.isArray(d.files)) setStorageFiles(d.files);
        }
      } catch {
        // Non-fatal
      }
    };

    if (!firebaseUser) {
      void fetchServerSellerData();
      const onRefresh = () => void fetchServerSellerData();
      window.addEventListener('passo-store-refresh', onRefresh);
      return () => window.removeEventListener('passo-store-refresh', onRefresh);
    }

    const unsubs = [
      onSnapshot(collection(db, 'orders'), (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        list.sort((a, b) => (b.statusHistory?.[0]?.timestampMs || 0) - (a.statusHistory?.[0]?.timestampMs || 0));
        setOrders(list);
      }),
      onSnapshot(collection(db, 'users'), (snap) => {
        setCustomers(snap.docs.map((d) => d.data() as UserProfile));
      }),
      onSnapshot(collection(db, 'stockMovements'), (snap) => {
        const list = snap.docs.map((d) => d.data() as StockMovement);
        setMovements(list.reverse());
      }),
      onSnapshot(collection(db, 'storageFiles'), (snap) => {
        setStorageFiles(snap.docs.map((d) => d.data() as StorageFileRecord));
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [authUser, firebaseUser, isSeller]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center text-sm text-zinc-600">
        Verificando credenciais do vendedor...
      </div>
    );
  }

  if (!authUser || !isSeller) {
    return null;
  }

  const storageLimitBytes = settings.storageLimitBytes || 4 * 1024 * 1024 * 1024;
  const usedStorageBytes = storageFiles.reduce((s, f) => s + f.sizeBytes, 0);
  const storageBlocked = usedStorageBytes >= storageLimitBytes;

  // Estimativa conservadora de tamanho médio por documento no Firestore (~1.2 KB/doc)
  const estimatedFirestoreBytes =
    products.length * 1800 +
    inventory.length * 600 +
    orders.length * 2200 +
    customers.length * 900 +
    movements.length * 500 +
    reviews.length * 600;

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 flex">
      {/* Sidebar fixa desktop */}
      <aside className="hidden lg:flex w-64 bg-zinc-950 text-zinc-300 flex-col justify-between shrink-0 border-r border-zinc-800">
        <div className="p-5 space-y-6">
          <div>
            <p className="font-display text-lg font-extrabold text-white tracking-tight">PASSO URBANO</p>
            <p className="text-[11px] text-lime-400 font-semibold mt-0.5">Painel do Vendedor</p>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    active ? 'bg-lime-400 text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-zinc-800 space-y-2 text-xs">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 text-zinc-200 hover:text-white cursor-pointer"
          >
            <span>Ver loja pública</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Encerrar sessão</span>
          </button>
        </div>
      </aside>

      {/* Sidebar mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-zinc-950/60" />
          <aside className="relative z-10 w-64 bg-zinc-950 text-zinc-200 h-full p-5 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="font-display font-extrabold text-white">PASSO URBANO</span>
                <button onClick={() => setSidebarOpen(false)} className="p-1 text-zinc-400"><X className="w-5 h-5" /></button>
              </div>
              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold ${
                        active ? 'bg-lime-400 text-zinc-950' : 'text-zinc-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <button onClick={() => navigate('/')} className="px-3 py-2 text-xs bg-zinc-900 rounded-lg text-left">
              Ir para a loja
            </button>
          </aside>
        </div>
      )}

      {/* Área principal */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-zinc-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-zinc-200 text-zinc-700"
              aria-label="Abrir menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <p className="text-xs text-zinc-500">Painel Administrativo / {activeNav.label}</p>
              <h1 className="font-display text-base sm:text-lg font-bold text-zinc-950 leading-tight">
                {activeNav.label}
              </h1>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold text-zinc-950">{profile?.name || authUser.displayName || 'Administrador'}</p>
            <p className="text-[11px] text-zinc-500">{authUser.email}</p>
          </div>
        </header>

        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <SellerOverviewTab
              products={products}
              inventory={inventory}
              orders={orders}
              customers={customers}
              isFirestoreSeeded={isFirestoreSeeded}
              onNavigateTab={(t) => setActiveTab(t as SellerTabId)}
            />
          )}
          {activeTab === 'products' && (
            <SellerProductsTab
              products={products}
              categories={categories}
              brands={brands}
              inventory={inventory}
              storageBlocked={storageBlocked}
            />
          )}
          {activeTab === 'orders' && <SellerOrdersTab orders={orders} />}
          {activeTab === 'stock' && <SellerStockTab inventory={inventory} movements={movements} />}
          {activeTab === 'customers' && <SellerCustomersTab customers={customers} orders={orders} />}
          {activeTab === 'taxonomy' && (
            <SellerTaxonomyTab categories={categories} brands={brands} coupons={coupons} />
          )}
          {activeTab === 'reports' && (
            <SellerReportsTab orders={orders} products={products} inventory={inventory} />
          )}
          {activeTab === 'storage' && (
            <SellerStorageTab
              storageFiles={storageFiles}
              storageLimitBytes={storageLimitBytes}
              firestoreStats={{
                productsCount: products.length,
                inventoryCount: inventory.length,
                ordersCount: orders.length,
                customersCount: customers.length,
                movementsCount: movements.length,
                reviewsCount: reviews.length,
                estimatedBytes: estimatedFirestoreBytes,
              }}
            />
          )}
          {activeTab === 'settings' && (
            <SellerSettingsTab settings={settings} storageBlocked={storageBlocked} />
          )}
        </main>
      </div>
    </div>
  );
}
