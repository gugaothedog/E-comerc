import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Verificação estrutural das regras de segurança contra os vetores "Dirty Dozen"
 * especificados em security_spec.md.
 */
describe('Firestore Security Rules Invariants (PASSO URBANO)', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.existsSync(rulesPath)
    ? fs.readFileSync(rulesPath, 'utf8')
    : fs.readFileSync(path.resolve(process.cwd(), 'DRAFT_firestore.rules'), 'utf8');

  it('1. Enforces global default-deny safety net', () => {
    expect(rulesContent).toContain('match /{document=**}');
    expect(rulesContent).toContain('allow read, write: if false;');
  });

  it('2. Blocks self-assigned seller/admin privilege escalation on user registration', () => {
    expect(rulesContent).toContain("incoming().role == 'customer'");
  });

  it('3. Enforces strict PII isolation in /users/{userId}/private', () => {
    expect(rulesContent).toContain('match /private/{docId}');
    expect(rulesContent).toContain('isOwner(userId) || isSeller()');
  });

  it('4. Enforces non-negative stock and stock conservation law in /inventory', () => {
    expect(rulesContent).toContain('data.availableStock is number && data.availableStock >= 0');
    expect(rulesContent).toContain('data.reservedStock is number && data.reservedStock >= 0');
    expect(rulesContent).toContain('incoming().availableStock + incoming().reservedStock == existing().availableStock + existing().reservedStock');
  });

  it('5. Blocks manual payment approval without verified paymentEventId', () => {
    expect(rulesContent).toContain("incoming().paymentStatus == 'approved'");
    expect(rulesContent).toContain('exists(/databases/$(database)/documents/paymentEvents/$(incoming().lastPaymentEventId))');
    expect(rulesContent).toContain("incoming().status != 'pagamento_aprovado'");
  });

  it('6. Enforces verified email and path ID poisoning guards', () => {
    expect(rulesContent).toContain('request.auth.token.email_verified == true');
    expect(rulesContent).toContain('isValidId(');
  });
});
