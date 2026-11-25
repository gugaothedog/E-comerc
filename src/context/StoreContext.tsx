import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  DEFAULT_STORE_SETTINGS,
  INITIAL_BRANDS,
  INITIAL_CATEGORIES,
  INITIAL_COUPONS,
  INITIAL_PRODUCTS,
  buildInitialInventory,
} from '../lib/seedData';
import type {
  Brand,
  Category,
  Coupon,
  InventoryVariant,
  Product,
  Review,
  StoreSettings,
} from '../types/store';

interface StoreContextValue {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  inventory: InventoryVariant[];
  reviews: Review[];
  coupons: Coupon[];
  settings: StoreSettings;
  isFirestoreSeeded: boolean;
  loadingStore: boolean;
  getVariantStock: (variantId: string) => InventoryVariant | undefined;
  getProductTotalAvailable: (productId: string) => number;
  refreshStore: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [fsProducts, setFsProducts] = useState<Product[]>([]);
  const [fsCategories, setFsCategories] = useState<Category[]>([]);
  const [fsBrands, setFsBrands] = useState<Brand[]>([]);
  const [fsInventory, setFsInventory] = useState<InventoryVariant[]>([]);
  const [fsReviews, setFsReviews] = useState<Review[]>([]);
  const [fsCoupons, setFsCoupons] = useState<Coupon[]>([]);
  const [fsSettings, setFsSettings] = useState<StoreSettings | null>(null);

  const [srvProducts, setSrvProducts] = useState<Product[]>([]);
  const [srvCategories, setSrvCategories] = useState<Category[]>([]);
  const [srvBrands, setSrvBrands] = useState<Brand[]>([]);
  const [srvInventory, setSrvInventory] = useState<InventoryVariant[]>([]);
  const [srvReviews, setSrvReviews] = useState<Review[]>([]);
  const [srvCoupons, setSrvCoupons] = useState<Coupon[]>([]);
  const [srvSettings, setSrvSettings] = useState<StoreSettings | null>(null);
  const [srvSeeded, setSrvSeeded] = useState(false);

  const [loadedFlags, setLoadedFlags] = useState({ products: false, inventory: false });

  const refreshStore = useCallback(async () => {
    try {
      const resp = await fetch('/api/store/public');
      if (!resp.ok) return;
      const data = await resp.json();
      setSrvProducts(Array.isArray(data.products) ? data.products : []);
      setSrvCategories(Array.isArray(data.categories) ? data.categories : []);
      setSrvBrands(Array.isArray(data.brands) ? data.brands : []);
      setSrvInventory(Array.isArray(data.inventory) ? data.inventory : []);
      setSrvReviews(Array.isArray(data.reviews) ? data.reviews : []);
      setSrvCoupons(Array.isArray(data.coupons) ? data.coupons : []);
      if (data.settings) setSrvSettings(data.settings);
      setSrvSeeded(Boolean(data.seededOnServer));
    } catch {
      // Non-fatal fallback
    }
  }, []);

  useEffect(() => {
    void refreshStore();
    const onRefresh = () => {
      void refreshStore();
    };
    window.addEventListener('passo-store-refresh', onRefresh);
    return () => window.removeEventListener('passo-store-refresh', onRefresh);
  }, [refreshStore]);

  useEffect(() => {
    const unsubs = [
      onSnapshot(
        collection(db, 'products'),
        (snap) => {
          setFsProducts(snap.docs.map((d) => d.data() as Product));
          setLoadedFlags((prev) => ({ ...prev, products: true }));
        },
        () => setLoadedFlags((prev) => ({ ...prev, products: true }))
      ),
      onSnapshot(collection(db, 'categories'), (snap) => {
        setFsCategories(snap.docs.map((d) => d.data() as Category));
      }),
      onSnapshot(collection(db, 'brands'), (snap) => {
        setFsBrands(snap.docs.map((d) => d.data() as Brand));
      }),
      onSnapshot(
        collection(db, 'inventory'),
        (snap) => {
          setFsInventory(snap.docs.map((d) => d.data() as InventoryVariant));
          setLoadedFlags((prev) => ({ ...prev, inventory: true }));
        },
        () => setLoadedFlags((prev) => ({ ...prev, inventory: true }))
      ),
      onSnapshot(collection(db, 'reviews'), (snap) => {
        setFsReviews(snap.docs.map((d) => d.data() as Review));
      }),
      onSnapshot(collection(db, 'coupons'), (snap) => {
        setFsCoupons(snap.docs.map((d) => d.data() as Coupon));
      }),
      onSnapshot(doc(db, 'storeSettings', 'main'), (snap) => {
        if (snap.exists()) {
          setFsSettings(snap.data() as StoreSettings);
        }
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, []);

  const isFirestoreSeeded = fsProducts.length > 0 || srvSeeded;
  const products = fsProducts.length > 0 ? fsProducts : srvProducts.length > 0 ? srvProducts : INITIAL_PRODUCTS;
  const categories = fsCategories.length > 0 ? fsCategories : srvCategories.length > 0 ? srvCategories : INITIAL_CATEGORIES;
  const brands = fsBrands.length > 0 ? fsBrands : srvBrands.length > 0 ? srvBrands : INITIAL_BRANDS;
  const inventory = fsInventory.length > 0 ? fsInventory : srvInventory.length > 0 ? srvInventory : buildInitialInventory();
  const reviews = fsReviews.length > 0 ? fsReviews : srvReviews;
  const coupons = fsCoupons.length > 0 ? fsCoupons : srvCoupons.length > 0 ? srvCoupons : INITIAL_COUPONS;
  const settings = fsSettings ?? srvSettings ?? DEFAULT_STORE_SETTINGS;

  const getVariantStock = (variantId: string) => inventory.find((v) => v.id === variantId);

  const getProductTotalAvailable = (productId: string) =>
    inventory
      .filter((v) => v.productId === productId)
      .reduce((sum, v) => sum + Math.max(0, v.availableStock), 0);

  return (
    <StoreContext.Provider
      value={{
        products,
        categories,
        brands,
        inventory,
        reviews,
        coupons,
        settings,
        isFirestoreSeeded,
        loadingStore: !(loadedFlags.products && loadedFlags.inventory),
        getVariantStock,
        getProductTotalAvailable,
        refreshStore,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
