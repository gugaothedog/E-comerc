import { describe, it, expect, beforeEach } from 'vitest';
import { AtomicStockEngine, StockConflictError } from '../server/stockEngine';

describe('Controle Atômico de Estoque e Reservas Concorrentes (PASSO URBANO)', () => {
  let engine: AtomicStockEngine;

  beforeEach(async () => {
    engine = new AtomicStockEngine(null);
    await engine.upsertVariant({
      id: 'NIKE-AMAX-90_Preto_40',
      productId: 'prod_air_max',
      sku: 'NIKE-AMAX-90',
      productName: 'Nike Air Max Pulse',
      color: 'Preto',
      size: '40',
      availableStock: 1,
      reservedStock: 0,
      soldStock: 0,
    });
    await engine.upsertVariant({
      id: 'NIKE-AMAX-90_Preto_41',
      productId: 'prod_air_max',
      sku: 'NIKE-AMAX-90',
      productName: 'Nike Air Max Pulse',
      color: 'Preto',
      size: '41',
      availableStock: 5,
      reservedStock: 0,
      soldStock: 0,
    });
    await engine.upsertVariant({
      id: 'NIKE-AMAX-90_Preto_42',
      productId: 'prod_air_max',
      sku: 'NIKE-AMAX-90',
      productName: 'Nike Air Max Pulse',
      color: 'Preto',
      size: '42',
      availableStock: 3,
      reservedStock: 0,
      soldStock: 0,
    });
  });

  it('1. Dois clientes tentando comprar a última unidade simultaneamente: apenas 1 consegue reservar', async () => {
    const attemptA = engine.reserveItemsAtomically({
      userId: 'cliente_A',
      idempotencyKey: 'idem_A_last_unit',
      items: [
        {
          variantId: 'NIKE-AMAX-90_Preto_40',
          productId: 'prod_air_max',
          productName: 'Nike Air Max Pulse',
          sku: 'NIKE-AMAX-90',
          color: 'Preto',
          size: '40',
          quantity: 1,
          unitPrice: 799.9,
        },
      ],
    });

    const attemptB = engine.reserveItemsAtomically({
      userId: 'cliente_B',
      idempotencyKey: 'idem_B_last_unit',
      items: [
        {
          variantId: 'NIKE-AMAX-90_Preto_40',
          productId: 'prod_air_max',
          productName: 'Nike Air Max Pulse',
          sku: 'NIKE-AMAX-90',
          color: 'Preto',
          size: '40',
          quantity: 1,
          unitPrice: 799.9,
        },
      ],
    });

    const results = await Promise.allSettled([attemptA, attemptB]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(StockConflictError);

    const variant = engine.getVariant('NIKE-AMAX-90_Preto_40')!;
    expect(variant.availableStock).toBe(0);
    expect(variant.reservedStock).toBe(1);
    expect(variant.availableStock).toBeGreaterThanOrEqual(0);
  });

  it('2. Dez clientes tentando comprar cinco unidades: exatamente 5 reservam e 5 são bloqueados', async () => {
    const attempts = Array.from({ length: 10 }, (_, idx) =>
      engine.reserveItemsAtomically({
        userId: `cliente_${idx + 1}`,
        idempotencyKey: `idem_10_for_5_${idx + 1}`,
        items: [
          {
            variantId: 'NIKE-AMAX-90_Preto_41',
            productId: 'prod_air_max',
            productName: 'Nike Air Max Pulse',
            sku: 'NIKE-AMAX-90',
            color: 'Preto',
            size: '41',
            quantity: 1,
            unitPrice: 799.9,
          },
        ],
      })
    );

    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(5);
    expect(rejected).toHaveLength(5);

    const variant = engine.getVariant('NIKE-AMAX-90_Preto_41')!;
    expect(variant.availableStock).toBe(0);
    expect(variant.reservedStock).toBe(5);
  });

  it('3. Vários clientes tentando comprar tamanhos diferentes simultaneamente', async () => {
    const [r40, r41, r42] = await Promise.all([
      engine.reserveItemsAtomically({
        userId: 'user_40',
        idempotencyKey: 'idem_size_40',
        items: [{ variantId: 'NIKE-AMAX-90_Preto_40', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '40', quantity: 1, unitPrice: 799.9 }],
      }),
      engine.reserveItemsAtomically({
        userId: 'user_41',
        idempotencyKey: 'idem_size_41',
        items: [{ variantId: 'NIKE-AMAX-90_Preto_41', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '41', quantity: 2, unitPrice: 799.9 }],
      }),
      engine.reserveItemsAtomically({
        userId: 'user_42',
        idempotencyKey: 'idem_size_42',
        items: [{ variantId: 'NIKE-AMAX-90_Preto_42', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '42', quantity: 3, unitPrice: 799.9 }],
      }),
    ]);

    expect(r40.reservation.status).toBe('active');
    expect(r41.reservation.status).toBe('active');
    expect(r42.reservation.status).toBe('active');

    expect(engine.getVariant('NIKE-AMAX-90_Preto_40')!.availableStock).toBe(0);
    expect(engine.getVariant('NIKE-AMAX-90_Preto_41')!.availableStock).toBe(3);
    expect(engine.getVariant('NIKE-AMAX-90_Preto_42')!.availableStock).toBe(0);
  });

  it('4. Pagamentos simultâneos sobre a mesma reserva confirmam apenas uma vez', async () => {
    const { reservation } = await engine.reserveItemsAtomically({
      userId: 'cliente_A',
      idempotencyKey: 'idem_concurrent_pay',
      items: [{ variantId: 'NIKE-AMAX-90_Preto_40', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '40', quantity: 1, unitPrice: 799.9 }],
    });

    const [p1, p2] = await Promise.all([
      engine.confirmPaymentIdempotently({ reservationId: reservation.id, orderId: 'ORD-001', providerEventId: 'mp_evt_1' }),
      engine.confirmPaymentIdempotently({ reservationId: reservation.id, orderId: 'ORD-001', providerEventId: 'mp_evt_2' }),
    ]);

    expect([p1.status, p2.status].sort()).toEqual(['already_processed', 'confirmed']);
    const variant = engine.getVariant('NIKE-AMAX-90_Preto_40')!;
    expect(variant.reservedStock).toBe(0);
    expect(variant.soldStock).toBe(1);
    expect(variant.availableStock).toBe(0);
  });

  it('5. Pagamento expirado após 10 minutos é recusado e unidade volta ao estoque', async () => {
    const startMs = 1_700_000_000_000;
    const { reservation } = await engine.reserveItemsAtomically({
      userId: 'cliente_exp',
      idempotencyKey: 'idem_expired_pay',
      nowMs: startMs,
      items: [{ variantId: 'NIKE-AMAX-90_Preto_40', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '40', quantity: 1, unitPrice: 799.9 }],
    });

    const after11Min = startMs + 11 * 60 * 1000;
    const confirmation = await engine.confirmPaymentIdempotently({
      reservationId: reservation.id,
      orderId: 'ORD-EXP',
      providerEventId: 'mp_evt_late',
      nowMs: after11Min,
    });

    expect(confirmation.status).toBe('expired_error');
    const variant = engine.getVariant('NIKE-AMAX-90_Preto_40')!;
    expect(variant.availableStock).toBe(1);
    expect(variant.reservedStock).toBe(0);
    expect(variant.soldStock).toBe(0);
  });

  it('6. Reserva abandonada é liberada automaticamente pelo scheduler após 10 minutos', async () => {
    const startMs = 1_700_000_000_000;
    await engine.reserveItemsAtomically({
      userId: 'cliente_abandon',
      idempotencyKey: 'idem_abandon',
      nowMs: startMs,
      items: [{ variantId: 'NIKE-AMAX-90_Preto_40', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '40', quantity: 1, unitPrice: 799.9 }],
    });

    expect(engine.getVariant('NIKE-AMAX-90_Preto_40')!.availableStock).toBe(0);

    const expired = await engine.expireStaleReservations(startMs + 10 * 60 * 1000 + 1);
    expect(expired).toHaveLength(1);
    expect(expired[0].status).toBe('expired');
    expect(engine.getVariant('NIKE-AMAX-90_Preto_40')!.availableStock).toBe(1);
    expect(engine.getVariant('NIKE-AMAX-90_Preto_40')!.reservedStock).toBe(0);
  });

  it('7. Notificação de pagamento duplicada (mesmo providerEventId) é tratada com idempotência', async () => {
    const { reservation } = await engine.reserveItemsAtomically({
      userId: 'cliente_dup',
      idempotencyKey: 'idem_dup_webhook',
      items: [{ variantId: 'NIKE-AMAX-90_Preto_41', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '41', quantity: 2, unitPrice: 799.9 }],
    });

    const first = await engine.confirmPaymentIdempotently({
      reservationId: reservation.id,
      orderId: 'ORD-DUP',
      providerEventId: 'mp_webhook_same_id',
    });
    const second = await engine.confirmPaymentIdempotently({
      reservationId: reservation.id,
      orderId: 'ORD-DUP',
      providerEventId: 'mp_webhook_same_id',
    });

    expect(first.status).toBe('confirmed');
    expect(second.status).toBe('already_processed');
    const variant = engine.getVariant('NIKE-AMAX-90_Preto_41')!;
    expect(variant.soldStock).toBe(2);
    expect(variant.availableStock).toBe(3);
  });

  it('8. Cancelamento de pedido devolve unidades ao estoque disponível', async () => {
    const { reservation } = await engine.reserveItemsAtomically({
      userId: 'cliente_cancel',
      idempotencyKey: 'idem_cancel',
      items: [{ variantId: 'NIKE-AMAX-90_Preto_40', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '40', quantity: 1, unitPrice: 799.9 }],
    });

    await engine.confirmPaymentIdempotently({
      reservationId: reservation.id,
      orderId: 'ORD-CANCEL',
      providerEventId: 'mp_evt_cancel_setup',
    });
    expect(engine.getVariant('NIKE-AMAX-90_Preto_40')!.soldStock).toBe(1);

    const cancelled = await engine.releaseOrCancelReservation({
      reservationId: reservation.id,
      reason: 'Cancelamento solicitado pelo cliente',
      actorUid: 'cliente_cancel',
      targetStatus: 'cancelled',
    });

    expect(cancelled.status).toBe('cancelled');
    const variant = engine.getVariant('NIKE-AMAX-90_Preto_40')!;
    expect(variant.availableStock).toBe(1);
    expect(variant.soldStock).toBe(0);
    expect(variant.reservedStock).toBe(0);
  });

  it('9. Liberação após falha de pagamento e rollback atômico em carrinho multi-item', async () => {
    // Falha multi-item: tamanho 41 tem 5 unidades, tamanho 40 só tem 1 e pedimos 2 -> NÃO deve reservar o 41 parcialmente!
    await expect(
      engine.reserveItemsAtomically({
        userId: 'cliente_multi_fail',
        idempotencyKey: 'idem_multi_fail',
        items: [
          { variantId: 'NIKE-AMAX-90_Preto_41', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '41', quantity: 2, unitPrice: 799.9 },
          { variantId: 'NIKE-AMAX-90_Preto_40', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '40', quantity: 2, unitPrice: 799.9 },
        ],
      })
    ).rejects.toBeInstanceOf(StockConflictError);

    expect(engine.getVariant('NIKE-AMAX-90_Preto_41')!.availableStock).toBe(5);
    expect(engine.getVariant('NIKE-AMAX-90_Preto_41')!.reservedStock).toBe(0);

    // Reserva válida seguida de falha no pagamento -> libera estoque
    const { reservation } = await engine.reserveItemsAtomically({
      userId: 'cliente_pay_fail',
      idempotencyKey: 'idem_pay_fail',
      items: [{ variantId: 'NIKE-AMAX-90_Preto_40', productId: 'prod_air_max', productName: 'Nike Air Max Pulse', sku: 'NIKE-AMAX-90', color: 'Preto', size: '40', quantity: 1, unitPrice: 799.9 }],
    });
    expect(engine.getVariant('NIKE-AMAX-90_Preto_40')!.availableStock).toBe(0);

    await engine.releaseOrCancelReservation({
      reservationId: reservation.id,
      reason: 'Cartão recusado pelo gateway',
      actorUid: 'payment_gateway',
      targetStatus: 'released',
    });

    expect(engine.getVariant('NIKE-AMAX-90_Preto_40')!.availableStock).toBe(1);
    expect(engine.getVariant('NIKE-AMAX-90_Preto_40')!.reservedStock).toBe(0);
  });
});
