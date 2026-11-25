import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { AtomicStockEngine, StockConflictError, type EngineReservationItem, type EngineStorageFile } from './server/stockEngine.ts';
import { ADMIN_EMAIL, ServerAuthAndDataStore } from './server/authStore.ts';
import {
  DEFAULT_STORE_SETTINGS,
  INITIAL_BRANDS,
  INITIAL_CATEGORIES,
  INITIAL_COUPONS,
  INITIAL_PRODUCTS,
  buildInitialInventory,
} from './src/lib/seedData.ts';
import type { Order, OrderStatus, UserRole } from './src/types/store.ts';

const PORT = Number(process.env.PORT || 3000);

// Carrega configuração do Firebase para verificar ID Tokens (não requer IAM)
const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firebaseProjectId = '';
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    if (parsed.projectId && parsed.projectId !== 'remixed-project-id') {
      firebaseProjectId = parsed.projectId;
    }
  } catch {
    // Ignore parse error
  }
}

if (firebaseProjectId) {
  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId });
  } else {
    getApp();
  }
}

const serverSigningKey = process.env.SESSION_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');
const ledgerPath = path.resolve(process.cwd(), 'data', 'stock-ledger.json');
const authStorePath = path.resolve(process.cwd(), 'data', 'app-store.json');
const stockEngine = new AtomicStockEngine(ledgerPath);
const authStore = new ServerAuthAndDataStore(authStorePath, serverSigningKey);

// Rotina confiável no backend: expira reservas vencidas (> 10 min) a cada 10 segundos,
// independente de o comprador manter o navegador aberto.
setInterval(async () => {
  try {
    await stockEngine.expireStaleReservations();
  } catch (err) {
    console.error('Erro na rotina de expiração de reservas:', err);
  }
}, 10_000);

interface AuthUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  email_verified: boolean;
  source: 'firebase' | 'server';
}

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }
  const token = authHeader.slice(7).trim();

  // 1. Verifica token emitido pelo servidor (sessão scrypt E-mail/Senha)
  if (token.startsWith('srv.')) {
    const verified = authStore.verifyToken(token);
    if (!verified) {
      res.status(401).json({ error: 'Sessão expirada ou inválida. Entre novamente.' });
      return;
    }
    req.user = {
      uid: verified.uid,
      email: verified.email,
      name: verified.name,
      role: verified.role,
      email_verified: true,
      source: 'server',
    };
    next();
    return;
  }

  // 2. Verifica ID Token emitido pelo Firebase Authentication (ex: Google Sign-In)
  if (!firebaseProjectId) {
    res.status(503).json({ error: 'Projeto Firebase não configurado no servidor.' });
    return;
  }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const role: UserRole =
      decoded.email === ADMIN_EMAIL && decoded.email_verified
        ? 'admin'
        : decoded.role === 'seller' || decoded.role === 'admin'
        ? decoded.role
        : 'customer';
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      name: String(decoded.name || decoded.email || 'Cliente Passo Urbano'),
      role,
      email_verified: Boolean(decoded.email_verified),
      source: 'firebase',
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token de autenticação inválido ou expirado.' });
  }
}

function isUserSeller(user: AuthUser | undefined): boolean {
  if (!user) return false;
  if (user.email.toLowerCase() === ADMIN_EMAIL && user.email_verified) return true;
  return user.role === 'seller' || user.role === 'admin';
}

function signVerificationProof(payload: { orderId: string; reservationId: string; providerEventId: string; amount: number }): string {
  const data = `${payload.orderId}|${payload.reservationId}|${payload.providerEventId}|${payload.amount}`;
  return crypto.createHmac('sha256', serverSigningKey).update(data).digest('hex');
}

function verifyMercadoPagoSignature(req: Request): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return false;

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  if (typeof xSignature !== 'string' || typeof xRequestId !== 'string') return false;

  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const [k, v] = part.trim().split('=');
      return [k, v];
    })
  );

  const ts = parts.ts;
  const v1 = parts.v1;
  const dataId = (req.query['data.id'] as string) || (req.body?.data?.id ? String(req.body.data.id) : '');
  if (!ts || !v1 || !dataId) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(v1));
  } catch {
    return false;
  }
}

async function bootstrapInitialInventoryIfEmpty() {
  if (stockEngine.getAllVariants().length === 0) {
    const initialVariants = buildInitialInventory();
    for (const v of initialVariants) {
      await stockEngine.upsertVariant(
        {
          id: v.id,
          productId: v.productId,
          sku: v.sku,
          productName: v.productName,
          color: v.color,
          size: v.size,
          availableStock: v.availableStock,
          reservedStock: v.reservedStock,
          soldStock: v.soldStock,
        },
        'system_bootstrap'
      );
    }
  }
}

async function startServer() {
  await bootstrapInitialInventoryIfEmpty();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'passo-urbano-backend', timestamp: Date.now() });
  });

  // =========================================================================
  // AUTENTICAÇÃO UNIFICADA (COMPRADORES + VENDEDOR ADMINISTRADOR)
  // =========================================================================

  app.get('/api/auth/seller-status', (_req, res) => {
    res.json({
      claimed: authStore.hasSellerClaimed(),
      adminEmail: ADMIN_EMAIL,
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Informe nome completo, e-mail e senha.' });
      return;
    }
    try {
      const result = authStore.registerUser({ name, email, password });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Não foi possível criar a conta.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Informe e-mail e senha.' });
      return;
    }
    try {
      const result = authStore.loginUser({ email, password });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha no login.';
      if (msg === 'SELLER_NOT_CLAIMED') {
        res.status(409).json({
          code: 'SELLER_NOT_CLAIMED',
          error: 'Primeiro acesso do vendedor detectado. Defina uma senha na aba Criar conta para ativar o painel administrativo.',
        });
        return;
      }
      res.status(401).json({ error: msg });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const stored = authStore.getUserByEmail(user.email);
    res.json({
      user: stored || {
        uid: user.uid,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: '',
        cpf: '',
        addresses: [],
      },
    });
  });

  app.put('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { name, phone, cpf, addresses } = req.body || {};
    try {
      const updated = authStore.updateProfile(user.email, {
        name: String(name || user.name || ''),
        phone: String(phone || ''),
        cpf: String(cpf || ''),
        addresses: Array.isArray(addresses) ? addresses : [],
      });
      res.json({ user: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao salvar perfil.' });
    }
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
      return;
    }
    try {
      authStore.changePassword(user.email, currentPassword, newPassword);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Não foi possível alterar a senha.' });
    }
  });

  // =========================================================================
  // DADOS DA LOJA NO SERVIDOR (ESPELHO PARA SESSÕES DE E-MAIL/SENHA & SNAPSHOT)
  // =========================================================================

  app.get('/api/store/public', async (_req, res) => {
    await stockEngine.expireStaleReservations();
    const storedProducts = authStore.listProducts();
    const storedCategories = authStore.listCategories();
    const storedBrands = authStore.listBrands();
    const storedCoupons = authStore.listCoupons();
    const storedReviews = authStore.listReviews();
    const storedSettings = authStore.getSettings();

    res.json({
      products: storedProducts.length > 0 ? storedProducts : INITIAL_PRODUCTS,
      categories: storedCategories.length > 0 ? storedCategories : INITIAL_CATEGORIES,
      brands: storedBrands.length > 0 ? storedBrands : INITIAL_BRANDS,
      coupons: storedCoupons.length > 0 ? storedCoupons : INITIAL_COUPONS,
      reviews: storedReviews,
      settings: storedSettings || DEFAULT_STORE_SETTINGS,
      inventory: stockEngine.getAllVariants(),
      movements: stockEngine.getMovements().slice(0, 100),
      seededOnServer: storedProducts.length > 0,
    });
  });

  app.get('/api/store/orders', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const orders = isUserSeller(user) ? authStore.listOrders() : authStore.listOrders(user.uid);
    res.json({ orders });
  });

  app.post('/api/store/orders', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const order = req.body?.order as Order | undefined;
    if (!order || !order.id || !order.reservationId) {
      res.status(400).json({ error: 'Dados do pedido inválidos.' });
      return;
    }
    const safeOrder: Order = {
      ...order,
      userId: user.uid,
      customerEmail: order.customerEmail || user.email,
      customerName: order.customerName || user.name,
    };
    const saved = authStore.saveOrder(safeOrder);
    res.status(201).json({ order: saved });
  });

  app.patch('/api/store/orders/:orderId', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const existing = authStore.getOrder(req.params.orderId);
    if (!existing) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }

    const seller = isUserSeller(user);
    if (!seller && existing.userId !== user.uid) {
      res.status(403).json({ error: 'Sem permissão para alterar este pedido.' });
      return;
    }

    if (!seller) {
      // Comprador só pode solicitar cancelamento do próprio pedido
      if (req.body?.cancellationRequested) {
        const updated: Order = {
          ...existing,
          cancellationRequested: true,
          cancellationReason: String(req.body.cancellationReason || '').slice(0, 300),
        };
        authStore.saveOrder(updated);
        res.json({ order: updated });
        return;
      }
      res.status(403).json({ error: 'Operação permitida apenas para vendedores.' });
      return;
    }

    const nextStatus = req.body?.nextStatus as OrderStatus | undefined;
    if (nextStatus === 'pagamento_aprovado' && existing.paymentStatus !== 'approved') {
      res.status(400).json({
        error: 'Operação bloqueada: o pagamento só pode ser aprovado após confirmação válida do gateway Mercado Pago.',
      });
      return;
    }

    const updated: Order = {
      ...existing,
      status: nextStatus || existing.status,
      trackingCode: req.body?.trackingCode !== undefined ? req.body.trackingCode : existing.trackingCode,
      statusHistory: nextStatus
        ? [
            ...existing.statusHistory,
            {
              status: nextStatus,
              note: String(req.body?.note || `Estado atualizado para ${nextStatus}`),
              actor: user.email || user.uid,
              timestampMs: Date.now(),
            },
          ]
        : existing.statusHistory,
    };

    if (nextStatus === 'cancelado' && existing.reservationId) {
      await stockEngine.releaseOrCancelReservation({
        reservationId: existing.reservationId,
        reason: `Pedido ${existing.orderNumber} cancelado pelo vendedor`,
        actorUid: user.uid,
        targetStatus: 'cancelled',
      }).catch(() => undefined);
    }

    authStore.saveOrder(updated);
    res.json({ order: updated });
  });

  app.get('/api/store/customers', requireAuth, (req: AuthenticatedRequest, res) => {
    if (!isUserSeller(req.user)) {
      res.status(403).json({ error: 'Acesso restrito ao vendedor.' });
      return;
    }
    const users = authStore.listAllUsers().map((u) => {
      const userOrders = authStore.listOrders(u.uid);
      const totalSpent = userOrders
        .filter((o) => o.paymentStatus === 'approved' && o.status !== 'cancelado')
        .reduce((s, o) => s + o.totalAmount, 0);
      return {
        uid: u.uid,
        name: u.name,
        email: u.email,
        role: u.role,
        totalOrders: userOrders.length,
        totalSpent,
        createdAt: u.createdAtMs,
      };
    });
    res.json({ customers: users });
  });

  app.post('/api/store/products', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!isUserSeller(req.user)) {
      res.status(403).json({ error: 'Apenas vendedores podem cadastrar ou editar produtos.' });
      return;
    }
    const { product, variantStockMap } = req.body || {};
    if (!product || typeof product.id !== 'string' || typeof product.sku !== 'string') {
      res.status(400).json({ error: 'Dados do produto inválidos.' });
      return;
    }
    if (authStore.listProducts().length === 0) {
      for (const p of INITIAL_PRODUCTS) authStore.saveProduct(p);
    }
    const saved = authStore.saveProduct(product);
    for (const color of saved.colors || []) {
      for (const size of saved.sizes || []) {
        const cleanColor = color.replace(/[^a-zA-Z0-9]/g, '');
        const cleanSize = size.replace(/[^a-zA-Z0-9]/g, '');
        const variantId = `${saved.sku}_${cleanColor}_${cleanSize}`;
        const desired = Math.max(0, Math.floor(Number(variantStockMap?.[variantId] ?? 5)));
        await stockEngine.upsertVariant(
          {
            id: variantId,
            productId: saved.id,
            sku: saved.sku,
            productName: saved.name,
            color,
            size,
            availableStock: desired,
            reservedStock: 0,
            soldStock: 0,
          },
          req.user!.uid
        );
      }
    }
    res.json({ product: saved });
  });

  app.delete('/api/store/products/:productId', requireAuth, (req: AuthenticatedRequest, res) => {
    if (!isUserSeller(req.user)) {
      res.status(403).json({ error: 'Apenas vendedores podem remover produtos.' });
      return;
    }
    const reserved = stockEngine
      .getAllVariants()
      .some((v) => v.productId === req.params.productId && v.reservedStock > 0);
    if (reserved) {
      res.status(409).json({ error: 'Não é possível excluir pois há unidades em reserva ativa de checkout.' });
      return;
    }
    authStore.deleteProduct(req.params.productId);
    res.json({ ok: true });
  });

  app.post('/api/store/taxonomy', requireAuth, (req: AuthenticatedRequest, res) => {
    if (!isUserSeller(req.user)) {
      res.status(403).json({ error: 'Apenas vendedores podem gerenciar categorias, marcas e cupons.' });
      return;
    }
    const { kind, action, item, id } = req.body || {};
    if (kind === 'category') {
      if (action === 'delete' && id) authStore.deleteCategory(String(id));
      else if (item) authStore.saveCategory(item);
    } else if (kind === 'brand') {
      if (action === 'delete' && id) authStore.deleteBrand(String(id));
      else if (item) authStore.saveBrand(item);
    } else if (kind === 'coupon') {
      if (action === 'delete' && id) authStore.deleteCoupon(String(id));
      else if (item) authStore.saveCoupon(item);
    }
    res.json({ ok: true });
  });

  app.put('/api/store/settings', requireAuth, (req: AuthenticatedRequest, res) => {
    if (!isUserSeller(req.user)) {
      res.status(403).json({ error: 'Apenas vendedores podem alterar as configurações.' });
      return;
    }
    const saved = authStore.saveSettings(req.body);
    res.json({ settings: saved });
  });

  app.post('/api/store/reviews', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { productId, rating, comment } = req.body || {};
    if (!productId || !comment) {
      res.status(400).json({ error: 'Comentário obrigatório.' });
      return;
    }
    const review = authStore.saveReview({
      id: `rev_${Date.now()}_${user.uid.slice(0, 6)}`,
      productId: String(productId),
      userId: user.uid,
      userName: user.name || 'Cliente Passo Urbano',
      rating: Math.min(5, Math.max(1, Number(rating || 5))),
      comment: String(comment).trim().slice(0, 1000),
      verifiedPurchase: true,
      createdAt: Date.now(),
    });
    res.status(201).json({ review });
  });

  app.post('/api/store/seed', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!isUserSeller(req.user)) {
      res.status(403).json({ error: 'Apenas vendedores podem publicar o catálogo.' });
      return;
    }
    for (const c of INITIAL_CATEGORIES) authStore.saveCategory(c);
    for (const b of INITIAL_BRANDS) authStore.saveBrand(b);
    for (const p of INITIAL_PRODUCTS) authStore.saveProduct(p);
    for (const c of INITIAL_COUPONS) authStore.saveCoupon(c);
    authStore.saveSettings(DEFAULT_STORE_SETTINGS);
    await bootstrapInitialInventoryIfEmpty();
    res.json({ ok: true });
  });

  // =========================================================================
  // ESTOQUE & RESERVAS ATÔMICAS DE 10 MINUTOS
  // =========================================================================

  app.get('/api/inventory/snapshot', async (_req, res) => {
    await stockEngine.expireStaleReservations();
    res.json({
      variants: stockEngine.getAllVariants(),
      movements: stockEngine.getMovements().slice(0, 100),
    });
  });

  app.post('/api/inventory/sync', requireAuth, async (req: AuthenticatedRequest, res) => {
    const variants = req.body?.variants;
    if (!Array.isArray(variants)) {
      res.status(400).json({ error: 'Lista de variações inválida.' });
      return;
    }
    const updated = [];
    for (const v of variants) {
      if (!v || typeof v.id !== 'string' || typeof v.productId !== 'string') continue;
      const saved = await stockEngine.upsertVariant(
        {
          id: v.id,
          productId: v.productId,
          sku: String(v.sku || ''),
          productName: String(v.productName || ''),
          color: String(v.color || ''),
          size: String(v.size || ''),
          availableStock: Number(v.availableStock ?? 0),
          reservedStock: Number(v.reservedStock ?? 0),
          soldStock: Number(v.soldStock ?? 0),
        },
        req.user?.uid || 'system'
      );
      updated.push(saved);
    }
    res.json({ variants: updated });
  });

  app.post('/api/inventory/adjust', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!isUserSeller(req.user)) {
      res.status(403).json({ error: 'Apenas vendedores autorizados podem ajustar o estoque.' });
      return;
    }
    const { variantId, delta, reason } = req.body || {};
    if (typeof variantId !== 'string' || typeof delta !== 'number' || !Number.isInteger(delta)) {
      res.status(400).json({ error: 'Parâmetros de ajuste inválidos.' });
      return;
    }
    try {
      const variant = await stockEngine.adjustAvailableStock(
        variantId,
        delta,
        typeof reason === 'string' && reason.trim() ? reason.trim() : 'Ajuste manual no painel do vendedor',
        req.user!.uid
      );
      res.json({ variant });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao ajustar estoque.' });
    }
  });

  app.post('/api/reservations/acquire', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { items, idempotencyKey } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || typeof idempotencyKey !== 'string' || !idempotencyKey) {
      res.status(400).json({ error: 'Itens ou chave de idempotência inválidos.' });
      return;
    }

    try {
      const sanitizedItems: EngineReservationItem[] = items.map((i) => ({
        variantId: String(i.variantId),
        productId: String(i.productId),
        productName: String(i.productName),
        sku: String(i.sku),
        color: String(i.color),
        size: String(i.size),
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
      }));

      const result = await stockEngine.reserveItemsAtomically({
        userId: req.user!.uid,
        idempotencyKey,
        items: sanitizedItems,
      });

      res.json(result);
    } catch (err) {
      if (err instanceof StockConflictError) {
        res.status(409).json({
          error: err.message,
          unavailableItems: err.unavailableItems,
        });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Falha ao reservar estoque.' });
    }
  });

  app.get('/api/reservations/:reservationId', requireAuth, async (req: AuthenticatedRequest, res) => {
    await stockEngine.expireStaleReservations();
    const reservation = stockEngine.getReservation(req.params.reservationId);
    if (!reservation) {
      res.status(404).json({ error: 'Reserva não encontrada.' });
      return;
    }
    if (reservation.userId !== req.user!.uid && !isUserSeller(req.user)) {
      res.status(403).json({ error: 'Acesso negado à reserva.' });
      return;
    }
    res.json({ reservation });
  });

  app.post('/api/reservations/:reservationId/release', requireAuth, async (req: AuthenticatedRequest, res) => {
    const reservation = stockEngine.getReservation(req.params.reservationId);
    if (!reservation) {
      res.status(404).json({ error: 'Reserva não encontrada.' });
      return;
    }
    if (reservation.userId !== req.user!.uid && !isUserSeller(req.user)) {
      res.status(403).json({ error: 'Sem permissão para liberar esta reserva.' });
      return;
    }
    const targetStatus = req.body?.cancelled ? 'cancelled' : 'released';
    const updated = await stockEngine.releaseOrCancelReservation({
      reservationId: reservation.id,
      reason: String(req.body?.reason || 'Reserva liberada pelo comprador/sistema'),
      actorUid: req.user!.uid,
      targetStatus,
    });
    res.json({ reservation: updated });
  });

  // =========================================================================
  // GATEWAY DE PAGAMENTO REAL (MERCADO PAGO) + WEBHOOK IDEMPOTENTE
  // =========================================================================

  app.get('/api/payments/mercadopago/config', (_req, res) => {
    const accessTokenConfigured = Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
    const webhookSecretConfigured = Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET);
    res.json({
      configured: accessTokenConfigured,
      webhookSecretConfigured,
      mode: accessTokenConfigured ? 'live_api' : 'awaiting_credentials',
    });
  });

  app.post('/api/payments/mercadopago/create', requireAuth, async (req: AuthenticatedRequest, res) => {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      res.status(503).json({
        code: 'MERCADOPAGO_NOT_CONFIGURED',
        error: 'Credencial MERCADOPAGO_ACCESS_TOKEN não configurada no servidor. Adicione o token no painel Secrets para habilitar cobranças reais.',
      });
      return;
    }

    const { orderId, reservationId, items, payerEmail, shippingCost, discountAmount, method } = req.body || {};
    if (typeof orderId !== 'string' || typeof reservationId !== 'string' || !Array.isArray(items)) {
      res.status(400).json({ error: 'Dados do pedido inválidos para pagamento.' });
      return;
    }

    await stockEngine.expireStaleReservations();
    const reservation = stockEngine.getReservation(reservationId);
    if (!reservation || reservation.status !== 'active') {
      res.status(409).json({ error: 'A reserva de 10 minutos expirou ou não está mais ativa. Refaça o checkout para verificar disponibilidade.' });
      return;
    }

    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const subtotal = items.reduce((sum: number, i: { unitPrice: number; quantity: number }) => sum + Number(i.unitPrice) * Number(i.quantity), 0);
    const totalAmount = Math.max(0.01, Number((subtotal - Number(discountAmount || 0) + Number(shippingCost || 0)).toFixed(2)));

    try {
      if (method === 'pix') {
        const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `mp_pix_${orderId}`,
          },
          body: JSON.stringify({
            transaction_amount: totalAmount,
            description: `PASSO URBANO — Pedido ${orderId}`,
            payment_method_id: 'pix',
            external_reference: `${orderId}|${reservationId}`,
            notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
            payer: {
              email: payerEmail || req.user?.email || 'cliente@passourbano.com.br',
            },
          }),
        });
        const mpData = await mpResp.json() as Record<string, unknown>;
        if (!mpResp.ok) {
          res.status(mpResp.status).json({ error: 'Falha ao gerar cobrança PIX no Mercado Pago.', details: mpData });
          return;
        }
        const poi = (mpData.point_of_interaction as Record<string, unknown> | undefined)?.transaction_data as Record<string, unknown> | undefined;
        res.json({
          provider: 'mercadopago',
          paymentId: String(mpData.id),
          status: String(mpData.status),
          qrCode: poi?.qr_code || null,
          qrCodeBase64: poi?.qr_code_base64 || null,
          ticketUrl: poi?.ticket_url || null,
        });
        return;
      }

      const prefResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            ...items.map((item: { productName: string; quantity: number; unitPrice: number }) => ({
              title: item.productName,
              quantity: Number(item.quantity),
              unit_price: Number(item.unitPrice),
              currency_id: 'BRL',
            })),
            ...(Number(shippingCost) > 0
              ? [{ title: 'Frete PASSO URBANO', quantity: 1, unit_price: Number(shippingCost), currency_id: 'BRL' }]
              : []),
          ],
          payer: { email: payerEmail || req.user?.email },
          external_reference: `${orderId}|${reservationId}`,
          notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
          back_urls: {
            success: `${appUrl}/minha-conta?pagamento=sucesso&pedido=${orderId}`,
            failure: `${appUrl}/checkout?pagamento=falha&pedido=${orderId}`,
            pending: `${appUrl}/minha-conta?pagamento=pendente&pedido=${orderId}`,
          },
          auto_return: 'approved',
          expires: true,
          expiration_date_to: new Date(reservation.expiresAtMs).toISOString(),
        }),
      });
      const prefData = await prefResp.json() as Record<string, unknown>;
      if (!prefResp.ok) {
        res.status(prefResp.status).json({ error: 'Erro ao criar preferência no Mercado Pago.', details: prefData });
        return;
      }
      res.json({
        provider: 'mercadopago',
        preferenceId: String(prefData.id),
        initPoint: String(prefData.init_point || prefData.sandbox_init_point || ''),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erro de comunicação com Mercado Pago.' });
    }
  });

  app.post('/api/payments/mercadopago/webhook', async (req, res) => {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      res.status(503).json({ error: 'Gateway não configurado.' });
      return;
    }

    if (process.env.MERCADOPAGO_WEBHOOK_SECRET && !verifyMercadoPagoSignature(req)) {
      res.status(401).json({ error: 'Assinatura HMAC do webhook inválida.' });
      return;
    }

    const paymentId = req.body?.data?.id || req.query['data.id'];
    if (!paymentId) {
      res.status(200).json({ ignored: true });
      return;
    }

    try {
      const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!mpResp.ok) {
        res.status(502).json({ error: 'Falha ao consultar pagamento no Mercado Pago.' });
        return;
      }

      const payment = await mpResp.json() as Record<string, unknown>;
      const extRef = String(payment.external_reference || '');
      const [orderId, reservationId] = extRef.split('|');
      if (!orderId || !reservationId) {
        res.status(200).json({ ignored: true, reason: 'external_reference ausente' });
        return;
      }

      const mpStatus = String(payment.status || '');
      const providerEventId = `mp_${payment.id}_${mpStatus}`;

      if (mpStatus === 'approved') {
        const result = await stockEngine.confirmPaymentIdempotently({
          reservationId,
          orderId,
          providerEventId,
        });
        const existingOrder = authStore.getOrder(orderId);
        if (existingOrder && existingOrder.paymentStatus !== 'approved') {
          authStore.saveOrder({
            ...existingOrder,
            paymentStatus: 'approved',
            paymentProviderId: String(payment.id),
            lastPaymentEventId: providerEventId,
            status: 'pagamento_aprovado',
            statusHistory: [
              ...existingOrder.statusHistory,
              {
                status: 'pagamento_aprovado',
                note: `Pagamento confirmado via webhook Mercado Pago (ID ${payment.id}).`,
                actor: 'mercadopago_webhook',
                timestampMs: Date.now(),
              },
            ],
          });
        }
        res.json({ ok: true, result });
        return;
      }

      if (mpStatus === 'rejected' || mpStatus === 'cancelled' || mpStatus === 'refunded') {
        await stockEngine.releaseOrCancelReservation({
          reservationId,
          reason: `Pagamento ${mpStatus} no Mercado Pago (${payment.id})`,
          actorUid: 'mercadopago_webhook',
          targetStatus: 'cancelled',
        });
        const existingOrder = authStore.getOrder(orderId);
        if (existingOrder && existingOrder.status !== 'cancelado') {
          authStore.saveOrder({
            ...existingOrder,
            paymentStatus: mpStatus === 'rejected' ? 'rejected' : 'cancelled',
            paymentProviderId: String(payment.id),
            lastPaymentEventId: providerEventId,
            status: 'cancelado',
            statusHistory: [
              ...existingOrder.statusHistory,
              {
                status: 'cancelado',
                note: `Pagamento ${mpStatus} via webhook Mercado Pago (ID ${payment.id}).`,
                actor: 'mercadopago_webhook',
                timestampMs: Date.now(),
              },
            ],
          });
        }
        res.json({ ok: true, released: true });
        return;
      }

      res.json({ ok: true, status: mpStatus });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao processar webhook.' });
    }
  });

  app.post('/api/payments/mercadopago/verify', requireAuth, async (req: AuthenticatedRequest, res) => {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      res.status(503).json({ error: 'MERCADOPAGO_ACCESS_TOKEN não configurado.' });
      return;
    }
    const { paymentId, orderId, reservationId } = req.body || {};
    if (typeof orderId !== 'string' || typeof reservationId !== 'string') {
      res.status(400).json({ error: 'orderId e reservationId obrigatórios.' });
      return;
    }

    try {
      let payment: Record<string, unknown> | null = null;
      if (paymentId) {
        const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (mpResp.ok) payment = await mpResp.json() as Record<string, unknown>;
      } else {
        const searchResp = await fetch(
          `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(`${orderId}|${reservationId}`)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (searchResp.ok) {
          const data = await searchResp.json() as { results?: Array<Record<string, unknown>> };
          payment = data.results?.[0] ?? null;
        }
      }

      if (!payment) {
        res.json({ verified: false, status: 'pending' });
        return;
      }

      const mpStatus = String(payment.status || 'pending');
      if (mpStatus === 'approved') {
        const providerEventId = `mp_${payment.id}_approved`;
        const confirmed = await stockEngine.confirmPaymentIdempotently({
          reservationId,
          orderId,
          providerEventId,
        });
        if (confirmed.status === 'expired_error') {
          res.status(409).json({
            verified: false,
            status: 'expired',
            error: 'A reserva expirou antes da confirmação do pagamento.',
          });
          return;
        }
        const existingOrder = authStore.getOrder(orderId);
        if (existingOrder && existingOrder.paymentStatus !== 'approved') {
          authStore.saveOrder({
            ...existingOrder,
            paymentStatus: 'approved',
            paymentProviderId: String(payment.id),
            lastPaymentEventId: providerEventId,
            status: 'pagamento_aprovado',
            statusHistory: [
              ...existingOrder.statusHistory,
              {
                status: 'pagamento_aprovado',
                note: `Pagamento confirmado via Mercado Pago (ID ${payment.id}).`,
                actor: 'mercadopago_gateway',
                timestampMs: Date.now(),
              },
            ],
          });
        }
        const amount = Number(payment.transaction_amount || 0);
        res.json({
          verified: true,
          status: 'approved',
          providerEventId,
          paymentProviderId: String(payment.id),
          amount,
          proof: signVerificationProof({ orderId, reservationId, providerEventId, amount }),
        });
        return;
      }

      if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
        await stockEngine.releaseOrCancelReservation({
          reservationId,
          reason: `Pagamento ${mpStatus} consultado no Mercado Pago`,
          actorUid: req.user!.uid,
          targetStatus: 'released',
        });
      }

      res.json({ verified: false, status: mpStatus });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao consultar gateway.' });
    }
  });

  // =========================================================================
  // CONTROLE DE ARMAZENAMENTO (4 GB OPERACIONAL NO FIREBASE STORAGE)
  // =========================================================================

  app.get('/api/storage/status', requireAuth, (_req, res) => {
    res.json(stockEngine.getStorageSummary());
  });

  app.post('/api/storage/preflight', requireAuth, async (req: AuthenticatedRequest, res) => {
    const sizeBytes = Number(req.body?.sizeBytes || 0);
    const check = await stockEngine.preflightStorageUpload(sizeBytes);
    if (!check.allowed) {
      res.status(403).json({ error: check.reason, summary: check.summary });
      return;
    }
    res.json(check);
  });

  app.post('/api/storage/register', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { id, name, mediaType, sizeBytes, url, path: filePath } = req.body || {};
    if (typeof id !== 'string' || typeof name !== 'string' || typeof sizeBytes !== 'number') {
      res.status(400).json({ error: 'Metadados de arquivo inválidos.' });
      return;
    }
    try {
      const summary = await stockEngine.registerStorageFile({
        id,
        name,
        mediaType: mediaType === 'video' || mediaType === 'banner' || mediaType === 'logo' ? mediaType : 'image',
        sizeBytes,
        url: String(url || ''),
        path: String(filePath || ''),
        uploadedBy: req.user!.uid,
        createdAtMs: Date.now(),
      });
      res.json(summary);
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Upload bloqueado pelo limite de 4 GB.' });
    }
  });

  app.delete('/api/storage/file/:fileId', requireAuth, async (req, res) => {
    const summary = await stockEngine.removeStorageFile(req.params.fileId);
    res.json(summary);
  });

  app.post('/api/storage/reconcile', requireAuth, async (req, res) => {
    const files = Array.isArray(req.body?.files) ? (req.body.files as EngineStorageFile[]) : [];
    const limitBytes = typeof req.body?.limitBytes === 'number' ? req.body.limitBytes : undefined;
    const summary = await stockEngine.reconcileStorageFiles(files, limitBytes);
    res.json(summary);
  });

  // =========================================================================
  // VITE / STATIC SERVING (PORT 3000)
  // =========================================================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PASSO URBANO server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
