# Security Specification — PASSO URBANO

## 1. Data Invariants
1. **Non-Negative & Conserved Inventory**: `availableStock >= 0`, `reservedStock >= 0`, `soldStock >= 0`. Client checkout transactions can only move units from `availableStock` to `reservedStock` while preserving `availableStock + reservedStock` and never altering `soldStock` without a verified payment event.
2. **No Self-Assigned Seller/Admin Privileges**: Users registering via `/users/{userId}` MUST have `role == 'customer'`. Only an existing admin can create or activate `/sellers/{userId}` or `/admins/{userId}`.
3. **Strict PII Isolation**: Phone numbers, CPF, and shipping addresses live in `/users/{userId}/private/info` and are readable/writable only by the owning user or an authorized seller/admin.
4. **No Unverified Payment Approval**: Neither buyers nor sellers can set `orders/{orderId}.paymentStatus = 'approved'` without a matching verified `/paymentEvents/{eventId}` record.
5. **Immutable Audit & Ownership Fields**: `createdAt`, `userId`, `operationId`, and `idempotencyKey` are immutable after document creation.
6. **Temporal Integrity**: `createdAt` and `updatedAt` are validated against `request.time`.

## 2. Dirty Dozen Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Privilege Escalation on Registration**: Client creates `/users/attacker` with `{ role: 'admin' }`.
2. **Shadow Field Injection on Product**: Attacker writes `/products/p1` with extra undocumented field `{ hiddenBackdoor: true }`.
3. **ID Poisoning**: Client writes `/orders/<1500-char-junk-id>` bypassing `isValidId()`.
4. **Negative Stock Creation**: Attacker writes `/inventory/sku1` with `{ availableStock: -5 }`.
5. **Unverified Seller Spoof**: User with `email_verified: false` claims admin email in auth token.
6. **PII Blanket Read**: Signed-in Customer A tries `get(/users/customerB/private/info)`.
7. **Order Query Scraping**: Signed-in Customer A calls `list(/orders)` without filtering `userId == customerA`.
8. **Manual Fake Payment Approval**: Seller or Customer updates `/orders/o1` setting `paymentStatus: 'approved'` without a verified `paymentEvents` document.
9. **Client Timestamp Tampering**: Client creates `/orders/o1` with backdated `createdAt` (`2020-01-01`).
10. **Stock Inflation During Checkout**: Customer updates `/inventory/sku1` increasing `availableStock` from `1` to `999`.
11. **Terminal Order Mutation**: Customer tries to alter `/orders/o1` items or `totalAmount` after creation.
12. **Unauthorized Storage Ledger Manipulation**: Customer tries to delete `/storageFiles/f1` or modify `/storeSettings/main`.
