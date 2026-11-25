import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface EngineVariant {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  availableStock: number;
  reservedStock: number;
  soldStock: number;
  updatedAtMs: number;
}

export interface EngineReservationItem {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
}

export interface EngineReservation {
  id: string;
  operationId: string;
  idempotencyKey: string;
  userId: string;
  status: 'active' | 'confirmed' | 'expired' | 'released' | 'cancelled';
  items: EngineReservationItem[];
  totalAmount: number;
  createdAtMs: number;
  expiresAtMs: number;
  updatedAtMs: number;
  orderId?: string;
}

export interface EngineMovement {
  id: string;
  variantId: string;
  sku: string;
  color: string;
  size: string;
  type: 'entry' | 'exit' | 'adjustment' | 'reserve' | 'release' | 'confirm';
  quantityDelta: number;
  previousAvailable: number;
  newAvailable: number;
  previousReserved: number;
  newReserved: number;
  reason: string;
  actorUid: string;
  operationId: string;
  createdAtMs: number;
}

export interface EngineStorageFile {
  id: string;
  name: string;
  mediaType: 'image' | 'video' | 'banner' | 'logo';
  sizeBytes: number;
  url: string;
  path: string;
  uploadedBy: string;
  createdAtMs: number;
}

export interface LedgerSnapshot {
  variants: Record<string, EngineVariant>;
  reservations: Record<string, EngineReservation>;
  idempotencyToReservation: Record<string, string>;
  processedPaymentEvents: Record<string, { reservationId: string; orderId: string; status: string; processedAtMs: number }>;
  movements: EngineMovement[];
  storageFiles: Record<string, EngineStorageFile>;
  storageLimitBytes: number;
}

export const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_STORAGE_LIMIT_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB

export class StockConflictError extends Error {
  public readonly unavailableItems: Array<{ variantId: string; productName: string; color: string; size: string; requested: number; available: number }>;
  constructor(
    message: string,
    unavailableItems: Array<{ variantId: string; productName: string; color: string; size: string; requested: number; available: number }>
  ) {
    super(message);
    this.name = 'StockConflictError';
    this.unavailableItems = unavailableItems;
  }
}

export class AtomicStockEngine {
  private state: LedgerSnapshot;
  private mutexQueue: Promise<unknown> = Promise.resolve();
  private persistPath: string | null;

  constructor(persistPath?: string | null) {
    this.persistPath = persistPath ?? null;
    this.state = {
      variants: {},
      reservations: {},
      idempotencyToReservation: {},
      processedPaymentEvents: {},
      movements: [],
      storageFiles: {},
      storageLimitBytes: Number(process.env.STORAGE_OPERATIONAL_LIMIT_BYTES || DEFAULT_STORAGE_LIMIT_BYTES),
    };
    if (this.persistPath && fs.existsSync(this.persistPath)) {
      try {
        const raw = fs.readFileSync(this.persistPath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<LedgerSnapshot>;
        this.state = {
          ...this.state,
          ...parsed,
        };
      } catch {
        // Ignore corrupted snapshot and start clean
      }
    }
  }

  private persist(): void {
    if (!this.persistPath) return;
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.persistPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.persistPath);
    } catch {
      // Non-fatal persistence error
    }
  }

  private runSerialized<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.mutexQueue.then(fn, fn);
    this.mutexQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  public async upsertVariant(variant: Omit<EngineVariant, 'updatedAtMs'>, actorUid = 'system'): Promise<EngineVariant> {
    return this.runSerialized(() => {
      const now = Date.now();
      const existing = this.state.variants[variant.id];
      const nextAvailable = Math.max(0, Math.floor(variant.availableStock));
      const preservedReserved = existing ? existing.reservedStock : Math.max(0, Math.floor(variant.reservedStock));
      const nextSold = existing ? Math.max(existing.soldStock, Math.floor(variant.soldStock)) : Math.max(0, Math.floor(variant.soldStock));

      const updated: EngineVariant = {
        ...variant,
        availableStock: nextAvailable,
        reservedStock: preservedReserved,
        soldStock: nextSold,
        updatedAtMs: now,
      };
      this.state.variants[variant.id] = updated;

      if (!existing || existing.availableStock !== nextAvailable) {
        this.state.movements.unshift({
          id: `mov_${crypto.randomUUID()}`,
          variantId: variant.id,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          type: existing ? 'adjustment' : 'entry',
          quantityDelta: nextAvailable - (existing?.availableStock ?? 0),
          previousAvailable: existing?.availableStock ?? 0,
          newAvailable: nextAvailable,
          previousReserved: preservedReserved,
          newReserved: preservedReserved,
          reason: existing ? 'Sincronização de catálogo/estoque' : 'Cadastro inicial de estoque',
          actorUid,
          operationId: `sync_${now}`,
          createdAtMs: now,
        });
        if (this.state.movements.length > 500) this.state.movements.length = 500;
      }

      this.persist();
      return { ...updated };
    });
  }

  public async adjustAvailableStock(
    variantId: string,
    delta: number,
    reason: string,
    actorUid: string
  ): Promise<EngineVariant> {
    return this.runSerialized(() => {
      const v = this.state.variants[variantId];
      if (!v) throw new Error(`Variação ${variantId} não encontrada no estoque.`);
      const nextAvailable = v.availableStock + delta;
      if (nextAvailable < 0) {
        throw new Error(`Operação recusada: o estoque disponível de ${v.productName} (${v.size}) não pode ficar negativo.`);
      }
      const now = Date.now();
      const prevAvail = v.availableStock;
      v.availableStock = nextAvailable;
      v.updatedAtMs = now;

      this.state.movements.unshift({
        id: `mov_${crypto.randomUUID()}`,
        variantId: v.id,
        sku: v.sku,
        color: v.color,
        size: v.size,
        type: delta >= 0 ? 'entry' : 'exit',
        quantityDelta: delta,
        previousAvailable: prevAvail,
        newAvailable: nextAvailable,
        previousReserved: v.reservedStock,
        newReserved: v.reservedStock,
        reason,
        actorUid,
        operationId: `adj_${crypto.randomUUID()}`,
        createdAtMs: now,
      });
      this.persist();
      return { ...v };
    });
  }

  /**
   * Reserva atômica multi-item (Tudo ou Nada).
   * - Nunca reserva parcialmente se algum item não tiver estoque.
   * - Nunca permite estoque negativo.
   * - Evita reservas duplicadas via idempotencyKey.
   */
  public async reserveItemsAtomically(params: {
    userId: string;
    idempotencyKey: string;
    items: EngineReservationItem[];
    nowMs?: number;
    ttlMs?: number;
  }): Promise<{ reservation: EngineReservation; deduplicated: boolean }> {
    return this.runSerialized(() => {
      const now = params.nowMs ?? Date.now();
      const ttl = params.ttlMs ?? RESERVATION_TTL_MS;

      // Primeiro expira reservas vencidas antes de avaliar disponibilidade
      this.expireStaleInternal(now);

      // Checa idempotência
      const existingResId = this.state.idempotencyToReservation[params.idempotencyKey];
      if (existingResId && this.state.reservations[existingResId]) {
        const existingRes = this.state.reservations[existingResId];
        if (existingRes.status === 'active' && existingRes.expiresAtMs > now) {
          return { reservation: structuredClone(existingRes), deduplicated: true };
        }
      }

      if (!params.items.length) {
        throw new Error('O carrinho está vazio.');
      }

      // Agrupa quantidades caso o mesmo variantId apareça repetido
      const requiredByVariant = new Map<string, { qty: number; item: EngineReservationItem }>();
      for (const item of params.items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new Error(`Quantidade inválida para ${item.productName}.`);
        }
        const prev = requiredByVariant.get(item.variantId);
        if (prev) {
          prev.qty += item.quantity;
        } else {
          requiredByVariant.set(item.variantId, { qty: item.quantity, item });
        }
      }

      // Fase 1: Verificação completa sem mutação (All-or-Nothing)
      const unavailable: Array<{
        variantId: string;
        productName: string;
        color: string;
        size: string;
        requested: number;
        available: number;
      }> = [];

      for (const [variantId, req] of requiredByVariant.entries()) {
        const variant = this.state.variants[variantId];
        const available = variant ? variant.availableStock : 0;
        if (!variant || available < req.qty) {
          unavailable.push({
            variantId,
            productName: req.item.productName,
            color: req.item.color,
            size: req.item.size,
            requested: req.qty,
            available,
          });
        }
      }

      if (unavailable.length > 0) {
        const first = unavailable[0];
        throw new StockConflictError(
          `Produto indisponível no momento: ${first.productName} (${first.color}, Tam. ${first.size}). Disponível: ${first.available}.`,
          unavailable
        );
      }

      // Fase 2: Mutação atômica após confirmação de todos os itens
      const operationId = `op_${crypto.randomUUID()}`;
      const reservationId = `res_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

      for (const [variantId, req] of requiredByVariant.entries()) {
        const variant = this.state.variants[variantId];
        const prevAvail = variant.availableStock;
        const prevRes = variant.reservedStock;
        variant.availableStock -= req.qty;
        variant.reservedStock += req.qty;
        variant.updatedAtMs = now;

        this.state.movements.unshift({
          id: `mov_${crypto.randomUUID()}`,
          variantId,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          type: 'reserve',
          quantityDelta: -req.qty,
          previousAvailable: prevAvail,
          newAvailable: variant.availableStock,
          previousReserved: prevRes,
          newReserved: variant.reservedStock,
          reason: `Reserva temporária de checkout (10 min) — Op ${operationId}`,
          actorUid: params.userId,
          operationId,
          createdAtMs: now,
        });
      }

      const totalAmount = params.items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
      const reservation: EngineReservation = {
        id: reservationId,
        operationId,
        idempotencyKey: params.idempotencyKey,
        userId: params.userId,
        status: 'active',
        items: structuredClone(params.items),
        totalAmount,
        createdAtMs: now,
        expiresAtMs: now + ttl,
        updatedAtMs: now,
      };

      this.state.reservations[reservationId] = reservation;
      this.state.idempotencyToReservation[params.idempotencyKey] = reservationId;
      this.persist();

      return { reservation: structuredClone(reservation), deduplicated: false };
    });
  }

  private expireStaleInternal(nowMs: number): EngineReservation[] {
    const expiredList: EngineReservation[] = [];
    for (const res of Object.values(this.state.reservations)) {
      if (res.status === 'active' && res.expiresAtMs <= nowMs) {
        res.status = 'expired';
        res.updatedAtMs = nowMs;
        for (const item of res.items) {
          const variant = this.state.variants[item.variantId];
          if (variant) {
            const releaseQty = Math.min(item.quantity, variant.reservedStock);
            const prevAvail = variant.availableStock;
            const prevRes = variant.reservedStock;
            variant.reservedStock -= releaseQty;
            variant.availableStock += releaseQty;
            variant.updatedAtMs = nowMs;

            this.state.movements.unshift({
              id: `mov_${crypto.randomUUID()}`,
              variantId: variant.id,
              sku: variant.sku,
              color: variant.color,
              size: variant.size,
              type: 'release',
              quantityDelta: releaseQty,
              previousAvailable: prevAvail,
              newAvailable: variant.availableStock,
              previousReserved: prevRes,
              newReserved: variant.reservedStock,
              reason: `Expiração automática após 10 minutos — Reserva ${res.id}`,
              actorUid: 'system_scheduler',
              operationId: res.operationId,
              createdAtMs: nowMs,
            });
          }
        }
        expiredList.push(structuredClone(res));
      }
    }
    if (expiredList.length > 0) {
      this.persist();
    }
    return expiredList;
  }

  public async expireStaleReservations(nowMs?: number): Promise<EngineReservation[]> {
    return this.runSerialized(() => this.expireStaleInternal(nowMs ?? Date.now()));
  }

  public async confirmPaymentIdempotently(params: {
    reservationId: string;
    orderId: string;
    providerEventId: string;
    nowMs?: number;
  }): Promise<{ status: 'confirmed' | 'already_processed' | 'expired_error'; reservation: EngineReservation }> {
    return this.runSerialized(() => {
      const now = params.nowMs ?? Date.now();
      this.expireStaleInternal(now);

      const already = this.state.processedPaymentEvents[params.providerEventId];
      if (already) {
        const res = this.state.reservations[already.reservationId];
        return { status: 'already_processed', reservation: structuredClone(res) };
      }

      const res = this.state.reservations[params.reservationId];
      if (!res) {
        throw new Error(`Reserva ${params.reservationId} não encontrada.`);
      }

      if (res.status === 'confirmed') {
        this.state.processedPaymentEvents[params.providerEventId] = {
          reservationId: res.id,
          orderId: params.orderId,
          status: 'confirmed',
          processedAtMs: now,
        };
        this.persist();
        return { status: 'already_processed', reservation: structuredClone(res) };
      }

      if (res.status === 'expired' || res.status === 'released' || res.status === 'cancelled') {
        this.state.processedPaymentEvents[params.providerEventId] = {
          reservationId: res.id,
          orderId: params.orderId,
          status: 'expired_error',
          processedAtMs: now,
        };
        this.persist();
        return { status: 'expired_error', reservation: structuredClone(res) };
      }

      // Converte estoque reservado -> vendido
      for (const item of res.items) {
        const variant = this.state.variants[item.variantId];
        if (!variant || variant.reservedStock < item.quantity) {
          throw new Error(`Inconsistência ao confirmar reserva ${res.id} para ${item.variantId}.`);
        }
        const prevRes = variant.reservedStock;
        variant.reservedStock -= item.quantity;
        variant.soldStock += item.quantity;
        variant.updatedAtMs = now;

        this.state.movements.unshift({
          id: `mov_${crypto.randomUUID()}`,
          variantId: variant.id,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          type: 'confirm',
          quantityDelta: -item.quantity,
          previousAvailable: variant.availableStock,
          newAvailable: variant.availableStock,
          previousReserved: prevRes,
          newReserved: variant.reservedStock,
          reason: `Pagamento confirmado — Pedido ${params.orderId}`,
          actorUid: 'payment_gateway',
          operationId: res.operationId,
          createdAtMs: now,
        });
      }

      res.status = 'confirmed';
      res.orderId = params.orderId;
      res.updatedAtMs = now;

      this.state.processedPaymentEvents[params.providerEventId] = {
        reservationId: res.id,
        orderId: params.orderId,
        status: 'confirmed',
        processedAtMs: now,
      };
      this.persist();
      return { status: 'confirmed', reservation: structuredClone(res) };
    });
  }

  public async releaseOrCancelReservation(params: {
    reservationId: string;
    reason: string;
    actorUid: string;
    targetStatus?: 'released' | 'cancelled';
    nowMs?: number;
  }): Promise<EngineReservation> {
    return this.runSerialized(() => {
      const now = params.nowMs ?? Date.now();
      const res = this.state.reservations[params.reservationId];
      if (!res) throw new Error(`Reserva ${params.reservationId} não encontrada.`);

      if (res.status === 'expired' || res.status === 'released' || res.status === 'cancelled') {
        return structuredClone(res);
      }

      if (res.status === 'active') {
        for (const item of res.items) {
          const variant = this.state.variants[item.variantId];
          if (variant) {
            const releaseQty = Math.min(item.quantity, variant.reservedStock);
            const prevAvail = variant.availableStock;
            const prevRes = variant.reservedStock;
            variant.reservedStock -= releaseQty;
            variant.availableStock += releaseQty;
            variant.updatedAtMs = now;

            this.state.movements.unshift({
              id: `mov_${crypto.randomUUID()}`,
              variantId: variant.id,
              sku: variant.sku,
              color: variant.color,
              size: variant.size,
              type: 'release',
              quantityDelta: releaseQty,
              previousAvailable: prevAvail,
              newAvailable: variant.availableStock,
              previousReserved: prevRes,
              newReserved: variant.reservedStock,
              reason: params.reason,
              actorUid: params.actorUid,
              operationId: res.operationId,
              createdAtMs: now,
            });
          }
        }
      } else if (res.status === 'confirmed' && params.targetStatus === 'cancelled') {
        for (const item of res.items) {
          const variant = this.state.variants[item.variantId];
          if (variant) {
            const restockQty = Math.min(item.quantity, variant.soldStock);
            const prevAvail = variant.availableStock;
            variant.soldStock -= restockQty;
            variant.availableStock += restockQty;
            variant.updatedAtMs = now;

            this.state.movements.unshift({
              id: `mov_${crypto.randomUUID()}`,
              variantId: variant.id,
              sku: variant.sku,
              color: variant.color,
              size: variant.size,
              type: 'release',
              quantityDelta: restockQty,
              previousAvailable: prevAvail,
              newAvailable: variant.availableStock,
              previousReserved: variant.reservedStock,
              newReserved: variant.reservedStock,
              reason: params.reason,
              actorUid: params.actorUid,
              operationId: res.operationId,
              createdAtMs: now,
            });
          }
        }
      }

      res.status = params.targetStatus ?? 'released';
      res.updatedAtMs = now;
      this.persist();
      return structuredClone(res);
    });
  }

  public getVariant(variantId: string): EngineVariant | undefined {
    const v = this.state.variants[variantId];
    return v ? { ...v } : undefined;
  }

  public getAllVariants(): EngineVariant[] {
    return Object.values(this.state.variants).map((v) => ({ ...v }));
  }

  public getReservation(reservationId: string): EngineReservation | undefined {
    const r = this.state.reservations[reservationId];
    return r ? structuredClone(r) : undefined;
  }

  public getMovements(): EngineMovement[] {
    return structuredClone(this.state.movements);
  }

  // Controle de Cota de 4 GB do Firebase Storage
  public getStorageSummary() {
    const files = Object.values(this.state.storageFiles);
    let imageBytes = 0;
    let videoBytes = 0;
    for (const f of files) {
      if (f.mediaType === 'video') {
        videoBytes += f.sizeBytes;
      } else {
        imageBytes += f.sizeBytes;
      }
    }
    const usedBytes = imageBytes + videoBytes;
    const limitBytes = this.state.storageLimitBytes;
    const availableBytes = Math.max(0, limitBytes - usedBytes);
    const usagePercent = Math.min(100, Number(((usedBytes / limitBytes) * 100).toFixed(2)));
    const alertLevel =
      usagePercent >= 100 ? '100%' : usagePercent >= 90 ? '90%' : usagePercent >= 80 ? '80%' : 'ok';

    return {
      imageBytes,
      videoBytes,
      usedBytes,
      limitBytes,
      availableBytes,
      fileCount: files.length,
      usagePercent,
      alertLevel,
      blocked: usedBytes >= limitBytes,
      files: structuredClone(files),
    };
  }

  public async preflightStorageUpload(sizeBytes: number): Promise<{ allowed: boolean; reason?: string; summary: ReturnType<AtomicStockEngine['getStorageSummary']> }> {
    return this.runSerialized(() => {
      const summary = this.getStorageSummary();
      if (sizeBytes <= 0 || !Number.isFinite(sizeBytes)) {
        return { allowed: false, reason: 'Tamanho de arquivo inválido.', summary };
      }
      if (summary.usedBytes + sizeBytes > summary.limitBytes) {
        return {
          allowed: false,
          reason: 'Limite operacional de 4 GB do armazenamento atingido. Exclua ou substitua arquivos existentes para liberar espaço antes de enviar novos arquivos.',
          summary,
        };
      }
      return { allowed: true, summary };
    });
  }

  public async registerStorageFile(file: EngineStorageFile): Promise<ReturnType<AtomicStockEngine['getStorageSummary']>> {
    return this.runSerialized(() => {
      const summary = this.getStorageSummary();
      if (summary.usedBytes + file.sizeBytes > summary.limitBytes) {
        throw new Error('Limite operacional de 4 GB excedido.');
      }
      this.state.storageFiles[file.id] = { ...file };
      this.persist();
      return this.getStorageSummary();
    });
  }

  public async removeStorageFile(fileId: string): Promise<ReturnType<AtomicStockEngine['getStorageSummary']>> {
    return this.runSerialized(() => {
      delete this.state.storageFiles[fileId];
      this.persist();
      return this.getStorageSummary();
    });
  }

  public async reconcileStorageFiles(files: EngineStorageFile[], limitBytes?: number): Promise<ReturnType<AtomicStockEngine['getStorageSummary']>> {
    return this.runSerialized(() => {
      if (limitBytes && limitBytes > 0) {
        this.state.storageLimitBytes = limitBytes;
      }
      this.state.storageFiles = {};
      for (const f of files) {
        this.state.storageFiles[f.id] = { ...f };
      }
      this.persist();
      return this.getStorageSummary();
    });
  }
}
