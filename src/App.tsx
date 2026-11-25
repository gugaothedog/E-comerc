import { CartDrawer } from './components/CartDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { StoreProvider } from './context/StoreContext';
import { useRoute } from './lib/router';
import { CartPage } from './pages/CartPage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { CustomerAccountPage } from './pages/CustomerAccountPage';
import { CustomerAuthPage } from './pages/CustomerAuthPage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { SellerDashboardPage } from './pages/SellerDashboardPage';

function AppRoutes() {
  const { pathname, search } = useRoute();

  // Painel administrativo do vendedor (acessado após login unificado com conta de vendedor)
  if (pathname.startsWith('/vendedor/dashboard')) {
    return <SellerDashboardPage />;
  }

  let pageView: React.ReactNode;
  if (pathname === '/' || pathname === '') {
    pageView = <HomePage />;
  } else if (pathname === '/catalogo') {
    pageView = <CatalogPage searchParams={search} />;
  } else if (pathname.startsWith('/produto/')) {
    const productId = decodeURIComponent(pathname.replace('/produto/', ''));
    pageView = <ProductPage productId={productId} />;
  } else if (pathname === '/carrinho') {
    pageView = <CartPage />;
  } else if (pathname === '/checkout') {
    pageView = <CheckoutPage searchParams={search} />;
  } else if (pathname === '/login' || pathname === '/vendedor/login' || pathname === '/vendedor') {
    pageView = <CustomerAuthPage searchParams={search} />;
  } else if (pathname === '/minha-conta') {
    pageView = <CustomerAccountPage />;
  } else {
    pageView = <HomePage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-zinc-950">
      <Navbar currentPath={pathname} currentSearch={search} />
      <div className="flex-1">{pageView}</div>
      <Footer />
      <CartDrawer />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <StoreProvider>
          <CartProvider>
            <AppRoutes />
          </CartProvider>
        </StoreProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
