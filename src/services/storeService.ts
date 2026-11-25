import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { getActiveBearerToken, getMemoryAuthToken } from '../lib/sessionToken';
import {
  DEFAULT_STORE_SETTINGS,
  INITIAL_BRANDS,
  INITIAL_CATEGORIES,
  INITIAL_COUPONS,
  INITIAL_PRODUCTS,
  buildInitialInventory,
} from '../lib/seedData';
import type {
  Address,
  Brand,
  CartItem,
  Category,
  Coupon,
  InventoryVariant,
  Order,
  OrderStatus,
  Product,
  Reservation,
  StorageFileRecord,
  StoreSettings,
} from '../types/store';

function triggerStoreRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('passo-store-refresh'));
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getActiveBearerToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function logAdminAction(params: {
  action: string;
  targetType: string;
  targetId: string;
  details: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await setDoc(doc(db, 'adminLogs', id), {
      id,
      actorUid: user.uid,
      actorEmail: user.email || 'vendedor@passourbano.com.br',
      action: params.action.slice(0, 120),
      targetType: params.targetType.slice(0, 80),
      targetId: params.targetId.slice(0, 128),
      details: params.details.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Audit log best-effort when non-blocking
  }
}

export async function seedInitialCatalogToFirestore(): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch('/api/store/seed', {
    method: 'POST',
    headers,
  });

  if (auth.currentUser) {
    try {
      const batch = writeBatch(db);
      for (const cat of INITIAL_CATEGORIES) {
        batch.set(doc(db, 'categories', cat.id), {
          ...cat,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const brand of INITIAL_BRANDS) {
        batch.set(doc(db, 'brands', brand.id), {
          ...brand,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const prod of INITIAL_PRODUCTS) {
        batch.set(doc(db, 'products', prod.id), {
          ...prod,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      const variants = buildInitialInventory();
      for (const v of variants) {
        batch.set(doc(db, 'inventory', v.id), {
          ...v,
          updatedAt: serverTimestamp(),
        });
      }
      for (const c of INITIAL_COUPONS) {
        batch.set(doc(db, 'coupons', c.id), {
          ...c,
          createdAt: serverTimestamp(),
        });
      }
      batch.set(doc(db, 'storeSettings', 'main'), {
        ...DEFAULT_STORE_SETTINGS,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      await fetch('/api/inventory/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ variants }),
      });

      await logAdminAction({
        action: 'SEED_INITIAL_CATALOG',
        targetType: 'catalog',
        targetId: 'initial',
        details: `Catálogo inicial publicado com ${INITIAL_PRODUCTS.length} produtos e ${variants.length} variações.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  }
  triggerStoreRefresh();
}

export async function syncVariantsToBackend(variants: InventoryVariant[]): Promise<void> {
  try {
    if (!auth.currentUser && !getMemoryAuthToken()) return;
    const headers = await getAuthHeaders();
    await fetch('/api/inventory/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({ variants }),
    });
  } catch {
    // Non-blocking sync
  }
}

// =========================================================================
// CONTROLE ATÔMICO DE ESTOQUE & CHECKOUT (TRANSACTIONS + BACKEND ENGINE)
// =========================================================================

export async function acquireAtomicCheckoutReservation(params: {
  items: CartItem[];
  shippingAddress: Address;
  subtotal: number;
  discountCode?: string;
  discountAmount: number;
  shippingCost: number;
  totalAmount: number;
  paymentMethod: string;
  idempotencyKey: string;
  actorUser?: { uid: string; email: string; displayName: string; emailVerified: boolean };
}): Promise<{ reservation: Reservation; order: Order }> {
  const fbUser = auth.currentUser;
  const serverToken = getMemoryAuthToken();
  const activeActor = fbUser
    ? {
        uid: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || params.shippingAddress.recipient,
        emailVerified: fbUser.emailVerified,
      }
    : serverToken && params.actorUser
    ? params.actorUser
    : null;

  if (!activeActor) throw new Error('Faça login para finalizar sua compra.');
  if (!activeActor.emailVerified) {
    throw new Error('Verifique seu e-mail antes de concluir o pedido. Confira sua caixa de entrada ou reenvie a confirmação na sua conta.');
  }

  const headers = await getAuthHeaders();

  // 1. Tenta adquirir reserva atômica no backend serializado (bloqueia compras concorrentes)
  const backendResp = await fetch('/api/reservations/acquire', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      idempotencyKey: params.idempotencyKey,
      items: params.items.map((i) => ({
        variantId: i.variantId,
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        color: i.color,
        size: i.size,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
    }),
  });

  const backendData = await backendResp.json();
  if (!backendResp.ok) {
    throw new Error(backendData.error || 'Produto indisponível no momento.');
  }

  const backendReservation = backendData.reservation as {
    id: string;
    operationId: string;
    idempotencyKey: string;
    expiresAtMs: number;
  };

  const orderId = `ord_${backendReservation.id.replace(/^res_/, '')}`;
  const orderNumber = `PU-${Date.now().toString().slice(-6)}`;
  const user = activeActor;

  // 2. Se houver Firebase Auth ativo, executa também transação atômica no Cloud Firestore
  if (fbUser) {
    try {
      await runTransaction(db, async (transaction) => {
        const variantSnaps = await Promise.all(
          params.items.map((item) => transaction.get(doc(db, 'inventory', item.variantId)))
        );

      // Verifica se todas as variações existem e têm estoque suficiente no Firestore
      for (let i = 0; i < params.items.length; i++) {
        const snap = variantSnaps[i];
        const item = params.items[i];
        if (!snap.exists()) {
          throw new Error(`Variação ${item.productName} (${item.color}, Tam. ${item.size}) não encontrada no banco.`);
        }
        const data = snap.data() as InventoryVariant;
        if (data.availableStock < item.quantity) {
          throw new Error(
            `Produto indisponível: ${item.productName} (${item.color}, Tam. ${item.size}) possui apenas ${data.availableStock} unidade(s) disponível(is).`
          );
        }
      }

      // Aplica todas as deduções atomicamente (All-or-Nothing)
      for (let i = 0; i < params.items.length; i++) {
        const snap = variantSnaps[i];
        const item = params.items[i];
        const data = snap.data() as InventoryVariant;
        const newAvailable = data.availableStock - item.quantity;
        const newReserved = data.reservedStock + item.quantity;

        transaction.update(doc(db, 'inventory', item.variantId), {
          availableStock: newAvailable,
          reservedStock: newReserved,
          updatedAt: serverTimestamp(),
        });

        const movId = `mov_${backendReservation.operationId}_${i}`;
        transaction.set(doc(db, 'stockMovements', movId), {
          id: movId,
          variantId: item.variantId,
          productId: item.productId,
          sku: item.sku,
          color: item.color,
          size: item.size,
          type: 'reserve',
          quantityDelta: -item.quantity,
          previousAvailable: data.availableStock,
          newAvailable,
          previousReserved: data.reservedStock,
          newReserved,
          reason: `Reserva temporária de 10 minutos — Pedido ${orderNumber}`,
          actorUid: user.uid,
          operationId: backendReservation.operationId,
          createdAt: serverTimestamp(),
        });
      }

      // Grava reserva de 10 minutos no Firestore
      transaction.set(doc(db, 'reservations', backendReservation.id), {
        id: backendReservation.id,
        operationId: backendReservation.operationId,
        idempotencyKey: params.idempotencyKey,
        userId: user.uid,
        status: 'active',
        items: params.items.map((i) => ({
          variantId: i.variantId,
          productId: i.productId,
          productName: i.productName,
          sku: i.sku,
          color: i.color,
          size: i.size,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          image: i.image,
        })),
        totalAmount: params.totalAmount,
        expiresAtMs: backendReservation.expiresAtMs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Cria pedido vinculado à reserva aguardando pagamento confirmado pelo gateway
      transaction.set(doc(db, 'orders', orderId), {
        id: orderId,
        orderNumber,
        userId: user.uid,
        customerName: user.displayName || params.shippingAddress.recipient,
        customerEmail: user.email || '',
        reservationId: backendReservation.id,
        operationId: backendReservation.operationId,
        idempotencyKey: params.idempotencyKey,
        items: params.items.map((i) => ({
          variantId: i.variantId,
          productId: i.productId,
          productName: i.productName,
          sku: i.sku,
          color: i.color,
          size: i.size,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          image: i.image,
        })),
        subtotal: params.subtotal,
        discountCode: params.discountCode || '',
        discountAmount: params.discountAmount,
        shippingCost: params.shippingCost,
        totalAmount: params.totalAmount,
        paymentMethod: params.paymentMethod,
        paymentStatus: 'pending',
        status: 'aguardando_pagamento',
        shippingAddress: params.shippingAddress,
        trackingCode: null,
        statusHistory: [
          {
            status: 'aguardando_pagamento',
            note: 'Reserva de estoque de 10 minutos criada. Aguardando confirmação do Mercado Pago.',
            actor: user.email || user.uid,
            timestampMs: Date.now(),
          },
        ],
        cancellationRequested: false,
        cancellationReason: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    } catch (err) {
      // Rollback na reserva do backend caso a transação Firestore rejeite
      await fetch(`/api/reservations/${backendReservation.id}/release`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'Rollback após conflito de transação no Firestore' }),
      }).catch(() => undefined);
      throw err;
    }
  }

  const reservation: Reservation = {
    id: backendReservation.id,
    operationId: backendReservation.operationId,
    idempotencyKey: params.idempotencyKey,
    userId: user.uid,
    status: 'active',
    items: params.items,
    totalAmount: params.totalAmount,
    expiresAtMs: backendReservation.expiresAtMs,
  };

  const order: Order = {
    id: orderId,
    orderNumber,
    userId: user.uid,
    customerName: user.displayName || params.shippingAddress.recipient,
    customerEmail: user.email || '',
    reservationId: backendReservation.id,
    operationId: backendReservation.operationId,
    idempotencyKey: params.idempotencyKey,
    items: params.items,
    subtotal: params.subtotal,
    discountCode: params.discountCode,
    discountAmount: params.discountAmount,
    shippingCost: params.shippingCost,
    totalAmount: params.totalAmount,
    paymentMethod: params.paymentMethod,
    paymentStatus: 'pending',
    status: 'aguardando_pagamento',
    shippingAddress: params.shippingAddress,
    statusHistory: [
      {
        status: 'aguardando_pagamento',
        note: 'Reserva de estoque de 10 minutos criada.',
        actor: user.email || user.uid,
        timestampMs: Date.now(),
      },
    ],
  };

  await fetch('/api/store/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ order }),
  }).catch(() => undefined);
  triggerStoreRefresh();

  return { reservation, order };
}

export async function releaseReservationInFirestore(params: {
  reservationId: string;
  orderId?: string;
  targetStatus: 'expired' | 'released' | 'cancelled';
  reason: string;
}): Promise<void> {
  const fbUser = auth.currentUser;
  const serverToken = getMemoryAuthToken();
  if (!fbUser && !serverToken) return;
  const headers = await getAuthHeaders();

  await fetch(`/api/reservations/${params.reservationId}/release`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason: params.reason, cancelled: params.targetStatus === 'cancelled' }),
  }).catch(() => undefined);

  if (fbUser) {
    try {
      await runTransaction(db, async (transaction) => {
        const resRef = doc(db, 'reservations', params.reservationId);
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) return;
        const resData = resSnap.data() as Reservation;
        if (resData.status !== 'active') return;

        const variantSnaps = await Promise.all(
          resData.items.map((item) => transaction.get(doc(db, 'inventory', item.variantId)))
        );

        for (let i = 0; i < resData.items.length; i++) {
          const snap = variantSnaps[i];
          const item = resData.items[i];
          if (!snap.exists()) continue;
          const vData = snap.data() as InventoryVariant;
          const releaseQty = Math.min(item.quantity, vData.reservedStock);
          const newAvailable = vData.availableStock + releaseQty;
          const newReserved = vData.reservedStock - releaseQty;

          transaction.update(doc(db, 'inventory', item.variantId), {
            availableStock: newAvailable,
            reservedStock: newReserved,
            updatedAt: serverTimestamp(),
          });

          const movId = `mov_rel_${params.reservationId}_${i}`;
          transaction.set(doc(db, 'stockMovements', movId), {
            id: movId,
            variantId: item.variantId,
            productId: item.productId,
            sku: item.sku,
            color: item.color,
            size: item.size,
            type: 'release',
            quantityDelta: releaseQty,
            previousAvailable: vData.availableStock,
            newAvailable,
            previousReserved: vData.reservedStock,
            newReserved,
            reason: params.reason.slice(0, 240),
            actorUid: fbUser.uid,
            operationId: resData.operationId,
            createdAt: serverTimestamp(),
          });
        }

        transaction.update(resRef, {
          status: params.targetStatus,
          updatedAt: serverTimestamp(),
        });

        if (params.orderId) {
          const ordRef = doc(db, 'orders', params.orderId);
          const ordSnap = await transaction.get(ordRef);
          if (ordSnap.exists()) {
            const ordData = ordSnap.data() as Order;
            if (ordData.status === 'aguardando_pagamento') {
              transaction.update(ordRef, {
                paymentStatus: params.targetStatus === 'expired' ? 'expired' : 'cancelled',
                status: 'cancelado',
                statusHistory: [
                  ...ordData.statusHistory,
                  {
                    status: 'cancelado',
                    note: params.reason,
                    actor: fbUser.email || fbUser.uid,
                    timestampMs: Date.now(),
                  },
                ],
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `reservations/${params.reservationId}`);
    }
  }
  triggerStoreRefresh();
}

export async function verifyAndConfirmGatewayPayment(params: {
  orderId: string;
  reservationId: string;
  paymentId?: string;
}): Promise<{ verified: boolean; status: string }> {
  const fbUser = auth.currentUser;
  const serverToken = getMemoryAuthToken();
  if (!fbUser && !serverToken) throw new Error('Autenticação necessária.');
  const headers = await getAuthHeaders();

  const resp = await fetch('/api/payments/mercadopago/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Erro ao verificar pagamento no gateway.');
  }

  if (!data.verified) {
    return { verified: false, status: data.status || 'pending' };
  }

  const eventId = String(data.providerEventId).replace(/[^a-zA-Z0-9_-]/g, '_');

  if (fbUser) {
    try {
      await runTransaction(db, async (transaction) => {
        const eventRef = doc(db, 'paymentEvents', eventId);
        const existingEvt = await transaction.get(eventRef);
        if (existingEvt.exists()) return;

        const ordRef = doc(db, 'orders', params.orderId);
        const resRef = doc(db, 'reservations', params.reservationId);
        const [ordSnap, resSnap] = await Promise.all([transaction.get(ordRef), transaction.get(resRef)]);
        if (!ordSnap.exists() || !resSnap.exists()) {
          throw new Error('Pedido ou reserva não encontrados.');
        }
        const ordData = ordSnap.data() as Order;
        const resData = resSnap.data() as Reservation;
        if (ordData.paymentStatus === 'approved') return;

        const variantSnaps = await Promise.all(
          resData.items.map((item) => transaction.get(doc(db, 'inventory', item.variantId)))
        );

        for (let i = 0; i < resData.items.length; i++) {
          const snap = variantSnaps[i];
          const item = resData.items[i];
          if (!snap.exists()) continue;
          const vData = snap.data() as InventoryVariant;
          const confirmQty = Math.min(item.quantity, vData.reservedStock);
          transaction.update(doc(db, 'inventory', item.variantId), {
            reservedStock: vData.reservedStock - confirmQty,
            soldStock: vData.soldStock + confirmQty,
            updatedAt: serverTimestamp(),
          });
        }

        transaction.set(eventRef, {
          id: eventId,
          providerEventId: String(data.providerEventId),
          orderId: params.orderId,
          reservationId: params.reservationId,
          userId: fbUser.uid,
          status: 'approved',
          amount: Number(data.amount || ordData.totalAmount),
          verified: true,
          createdAt: serverTimestamp(),
        });

        transaction.update(resRef, {
          status: 'confirmed',
          updatedAt: serverTimestamp(),
        });

        transaction.update(ordRef, {
          paymentStatus: 'approved',
          paymentProviderId: String(data.paymentProviderId || ''),
          lastPaymentEventId: eventId,
          status: 'pagamento_aprovado',
          statusHistory: [
            ...ordData.statusHistory,
            {
              status: 'pagamento_aprovado',
              note: `Pagamento confirmado via Mercado Pago (ID ${data.paymentProviderId}).`,
              actor: 'mercadopago_gateway',
              timestampMs: Date.now(),
            },
          ],
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `orders/${params.orderId}`);
    }
  }

  triggerStoreRefresh();
  return { verified: true, status: 'approved' };
}

// =========================================================================
// OPERAÇÕES DO VENDEDOR (PRODUTOS, PEDIDOS, ESTOQUE, STORAGE 4 GB)
// =========================================================================

export async function saveProductAndVariants(
  product: Omit<Product, 'createdAt' | 'updatedAt'>,
  variantStockMap: Record<string, number>,
  isNew: boolean
): Promise<void> {
  const headers = await getAuthHeaders();
  const srvResp = await fetch('/api/store/products', {
    method: 'POST',
    headers,
    body: JSON.stringify({ product, variantStockMap }),
  });
  if (!srvResp.ok) {
    const d = await srvResp.json().catch(() => ({}));
    throw new Error(d.error || 'Erro ao salvar produto.');
  }

  if (auth.currentUser) {
    try {
      const prodRef = doc(db, 'products', product.id);
      if (isNew) {
        await setDoc(prodRef, {
          ...product,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existing = await getDoc(prodRef);
        await setDoc(
          prodRef,
          {
            ...product,
            createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const syncedVariants: InventoryVariant[] = [];
      for (const color of product.colors) {
        for (const size of product.sizes) {
          const cleanColor = color.replace(/[^a-zA-Z0-9]/g, '');
          const cleanSize = size.replace(/[^a-zA-Z0-9]/g, '');
          const variantId = `${product.sku}_${cleanColor}_${cleanSize}`;
          const varRef = doc(db, 'inventory', variantId);
          const varSnap = await getDoc(varRef);
          const desiredAvailable = Math.max(0, Math.floor(variantStockMap[variantId] ?? 0));

          if (!varSnap.exists()) {
            const payload: InventoryVariant = {
              id: variantId,
              productId: product.id,
              sku: product.sku,
              productName: product.name,
              color,
              size,
              availableStock: desiredAvailable,
              reservedStock: 0,
              soldStock: 0,
              lowStockThreshold: 2,
            };
            await setDoc(varRef, { ...payload, updatedAt: serverTimestamp() });
            syncedVariants.push(payload);
          } else {
            const existingVar = varSnap.data() as InventoryVariant;
            await updateDoc(varRef, {
              availableStock: desiredAvailable,
              updatedAt: serverTimestamp(),
            });
            syncedVariants.push({ ...existingVar, availableStock: desiredAvailable });
          }
        }
      }

      await syncVariantsToBackend(syncedVariants);
      await logAdminAction({
        action: isNew ? 'CREATE_PRODUCT' : 'UPDATE_PRODUCT',
        targetType: 'product',
        targetId: product.id,
        details: `${product.name} (${product.sku}) salvo.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `products/${product.id}`);
    }
  }
  triggerStoreRefresh();
}

export async function deleteProductById(productId: string, productName: string): Promise<void> {
  const headers = await getAuthHeaders();
  const resp = await fetch(`/api/store/products/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
    headers,
  });
  if (!resp.ok) {
    const d = await resp.json().catch(() => ({}));
    throw new Error(d.error || `Erro ao remover ${productName}.`);
  }

  if (auth.currentUser) {
    try {
      const q = query(collection(db, 'inventory'), where('productId', '==', productId));
      const snaps = await getDocs(q);
      for (const s of snaps.docs) {
        const v = s.data() as InventoryVariant;
        if (v.reservedStock > 0) {
          throw new Error(`Não é possível excluir "${productName}" pois há ${v.reservedStock} unidade(s) em reserva ativa de checkout.`);
        }
      }
      const batch = writeBatch(db);
      for (const s of snaps.docs) {
        batch.delete(s.ref);
      }
      batch.delete(doc(db, 'products', productId));
      await batch.commit();
      await logAdminAction({
        action: 'DELETE_PRODUCT',
        targetType: 'product',
        targetId: productId,
        details: `Produto ${productName} excluído.`,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('reserva ativa')) throw error;
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  }
  triggerStoreRefresh();
}

export async function adjustSellerVariantStock(params: {
  variant: InventoryVariant;
  newAvailableStock: number;
  reason: string;
}): Promise<void> {
  const fbUser = auth.currentUser;
  const serverToken = getMemoryAuthToken();
  if (!fbUser && !serverToken) throw new Error('Autenticação necessária.');
  if (params.newAvailableStock < 0) {
    throw new Error('O estoque disponível não pode ser negativo.');
  }

  const delta = params.newAvailableStock - params.variant.availableStock;
  const headers = await getAuthHeaders();
  const resp = await fetch('/api/inventory/adjust', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      variantId: params.variant.id,
      delta,
      reason: params.reason,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Falha ao ajustar estoque no backend.');
  }

  if (fbUser) {
    try {
      await runTransaction(db, async (transaction) => {
        const varRef = doc(db, 'inventory', params.variant.id);
        const snap = await transaction.get(varRef);
        if (!snap.exists()) return;
        const current = snap.data() as InventoryVariant;
        const actualDelta = params.newAvailableStock - current.availableStock;

        transaction.update(varRef, {
          availableStock: params.newAvailableStock,
          updatedAt: serverTimestamp(),
        });

        const movId = `mov_seller_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        transaction.set(doc(db, 'stockMovements', movId), {
          id: movId,
          variantId: current.id,
          productId: current.productId,
          sku: current.sku,
          color: current.color,
          size: current.size,
          type: actualDelta >= 0 ? 'entry' : 'exit',
          quantityDelta: actualDelta,
          previousAvailable: current.availableStock,
          newAvailable: params.newAvailableStock,
          previousReserved: current.reservedStock,
          newReserved: current.reservedStock,
          reason: params.reason.slice(0, 240),
          actorUid: fbUser.uid,
          operationId: `seller_adj_${Date.now()}`,
          createdAt: serverTimestamp(),
        });
      });

      await logAdminAction({
        action: 'ADJUST_STOCK',
        targetType: 'inventory',
        targetId: params.variant.id,
        details: `${params.variant.productName} (${params.variant.size}): ${params.variant.availableStock} -> ${params.newAvailableStock}. Motivo: ${params.reason}`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory/${params.variant.id}`);
    }
  }
  triggerStoreRefresh();
}

export async function updateOrderOperationalStatus(params: {
  order: Order;
  nextStatus: OrderStatus;
  trackingCode?: string;
  note: string;
}): Promise<void> {
  const fbUser = auth.currentUser;
  const serverToken = getMemoryAuthToken();
  if (!fbUser && !serverToken) throw new Error('Autenticação necessária.');

  if (params.nextStatus === 'pagamento_aprovado' && params.order.paymentStatus !== 'approved') {
    throw new Error('Operação bloqueada: o pagamento só pode ser aprovado após confirmação válida do gateway Mercado Pago.');
  }

  const headers = await getAuthHeaders();
  await fetch(`/api/store/orders/${encodeURIComponent(params.order.id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      nextStatus: params.nextStatus,
      trackingCode: params.trackingCode,
      note: params.note,
    }),
  }).catch(() => undefined);

  if (fbUser) {
    try {
      await updateDoc(doc(db, 'orders', params.order.id), {
        status: params.nextStatus,
        trackingCode: params.trackingCode !== undefined ? params.trackingCode : params.order.trackingCode ?? null,
        statusHistory: [
          ...params.order.statusHistory,
          {
            status: params.nextStatus,
            note: params.note,
            actor: fbUser.email || fbUser.uid,
            timestampMs: Date.now(),
          },
        ],
        updatedAt: serverTimestamp(),
      });

      if (params.nextStatus === 'cancelado') {
        await releaseReservationInFirestore({
          reservationId: params.order.reservationId,
          targetStatus: 'cancelled',
          reason: `Pedido ${params.order.orderNumber} cancelado pelo vendedor: ${params.note}`,
        });
      }

      await logAdminAction({
        action: 'UPDATE_ORDER_STATUS',
        targetType: 'order',
        targetId: params.order.id,
        details: `Pedido ${params.order.orderNumber}: ${params.order.status} -> ${params.nextStatus}`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${params.order.id}`);
    }
  }
  triggerStoreRefresh();
}

export async function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a duração do vídeo.'));
    };
    video.src = url;
  });
}

export async function uploadMediaWithQuotaGuard(params: {
  file: File;
  mediaType: 'image' | 'video' | 'banner' | 'logo';
  productId?: string;
  onProgress?: (pct: number) => void;
}): Promise<StorageFileRecord> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('O envio de arquivos ao Firebase Storage requer autenticação Firebase (Google). Você também pode colar URLs de imagem diretamente.');
  }

  if (params.mediaType === 'video') {
    const duration = await readVideoDurationSeconds(params.file);
    if (duration > 10.5) {
      throw new Error(`O vídeo possui ${duration.toFixed(1)}s. O limite máximo permitido por produto é de 10 segundos.`);
    }
  }

  const headers = await getAuthHeaders();

  // 1. Pré-validação no backend contra o limite operacional de 4 GB
  const preflightResp = await fetch('/api/storage/preflight', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sizeBytes: params.file.size }),
  });
  const preflightData = await preflightResp.json();
  if (!preflightResp.ok) {
    throw new Error(preflightData.error || 'Upload bloqueado pelo limite de 4 GB de armazenamento.');
  }

  const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const cleanName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `store/${params.mediaType}s/${fileId}_${cleanName}`;
  const storageRef = ref(storage, storagePath);

  const downloadUrl = await new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, params.file, {
      contentType: params.file.type,
    });
    task.on(
      'state_changed',
      (snap) => {
        if (params.onProgress && snap.totalBytes > 0) {
          params.onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });

  const record: StorageFileRecord = {
    id: fileId,
    path: storagePath,
    name: params.file.name.slice(0, 200),
    mediaType: params.mediaType,
    mimeType: params.file.type || 'application/octet-stream',
    sizeBytes: params.file.size,
    url: downloadUrl,
    productId: params.productId,
    uploadedBy: user.uid,
  };

  try {
    await setDoc(doc(db, 'storageFiles', fileId), {
      ...record,
      createdAt: serverTimestamp(),
    });
    await fetch('/api/storage/register', {
      method: 'POST',
      headers,
      body: JSON.stringify(record),
    });
    await logAdminAction({
      action: 'UPLOAD_MEDIA',
      targetType: 'storage',
      targetId: fileId,
      details: `Arquivo ${record.name} (${record.sizeBytes} bytes) enviado para ${storagePath}.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `storageFiles/${fileId}`);
  }

  return record;
}

export async function deleteStorageMediaRecord(file: StorageFileRecord): Promise<void> {
  const headers = await getAuthHeaders();
  try {
    if (auth.currentUser) {
      await deleteObject(ref(storage, file.path)).catch(() => undefined);
      await deleteDoc(doc(db, 'storageFiles', file.id));
    }
    await fetch(`/api/storage/file/${file.id}`, {
      method: 'DELETE',
      headers,
    });
    if (auth.currentUser) {
      await logAdminAction({
        action: 'DELETE_MEDIA',
        targetType: 'storage',
        targetId: file.id,
        details: `Arquivo ${file.name} (${file.sizeBytes} bytes) removido do Storage.`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `storageFiles/${file.id}`);
  }
}

export async function saveCategory(cat: Omit<Category, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch('/api/store/taxonomy', {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'category', action: 'save', item: cat }),
  });

  if (auth.currentUser) {
    try {
      const refDoc = doc(db, 'categories', cat.id);
      const existing = !isNew ? await getDoc(refDoc) : null;
      await setDoc(refDoc, {
        ...cat,
        createdAt: existing?.exists() ? existing.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `categories/${cat.id}`);
    }
  }
  triggerStoreRefresh();
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch('/api/store/taxonomy', {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'category', action: 'delete', id: categoryId }),
  });

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'categories', categoryId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${categoryId}`);
    }
  }
  triggerStoreRefresh();
}

export async function saveBrand(brand: Omit<Brand, 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch('/api/store/taxonomy', {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'brand', action: 'save', item: brand }),
  });

  if (auth.currentUser) {
    try {
      const refDoc = doc(db, 'brands', brand.id);
      const existing = !isNew ? await getDoc(refDoc) : null;
      await setDoc(refDoc, {
        ...brand,
        createdAt: existing?.exists() ? existing.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `brands/${brand.id}`);
    }
  }
  triggerStoreRefresh();
}

export async function deleteBrand(brandId: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch('/api/store/taxonomy', {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'brand', action: 'delete', id: brandId }),
  });

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'brands', brandId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `brands/${brandId}`);
    }
  }
  triggerStoreRefresh();
}

export async function saveCoupon(coupon: Omit<Coupon, 'createdAt'>): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch('/api/store/taxonomy', {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'coupon', action: 'save', item: coupon }),
  });

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'coupons', coupon.id), {
        ...coupon,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `coupons/${coupon.id}`);
    }
  }
  triggerStoreRefresh();
}

export async function deleteCoupon(couponId: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch('/api/store/taxonomy', {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'coupon', action: 'delete', id: couponId }),
  });

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'coupons', couponId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `coupons/${couponId}`);
    }
  }
  triggerStoreRefresh();
}

export async function saveStoreSettings(settings: Omit<StoreSettings, 'updatedAt'>): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch('/api/store/settings', {
    method: 'PUT',
    headers,
    body: JSON.stringify(settings),
  });

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'storeSettings', 'main'), {
        ...settings,
        updatedAt: serverTimestamp(),
      });
      await logAdminAction({
        action: 'UPDATE_STORE_SETTINGS',
        targetType: 'settings',
        targetId: 'main',
        details: `Configurações da loja ${settings.storeName} atualizadas.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'storeSettings/main');
    }
  }
  triggerStoreRefresh();
}
