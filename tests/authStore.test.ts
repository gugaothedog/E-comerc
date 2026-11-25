import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADMIN_EMAIL, ServerAuthAndDataStore } from '../server/authStore';

describe('ServerAuthAndDataStore', () => {
  let tmpDir: string;
  let storePath: string;
  let store: ServerAuthAndDataStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'passo-auth-test-'));
    storePath = path.join(tmpDir, 'app-store.json');
    store = new ServerAuthAndDataStore(storePath, 'test-secret-key-12345');
    delete process.env.SELLER_ADMIN_PASSCODE;
  });

  afterEach(() => {
    delete process.env.SELLER_ADMIN_PASSCODE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers a customer, hashes password with scrypt, and logs in', () => {
    const { user, token } = store.registerUser({
      name: 'Comprador Teste',
      email: 'comprador@exemplo.com',
      password: 'Password123',
    });

    expect(user.email).toBe('comprador@exemplo.com');
    expect(user.role).toBe('customer');
    expect(token.startsWith('srv.')).toBe(true);

    const verified = store.verifyToken(token);
    expect(verified?.email).toBe('comprador@exemplo.com');
    expect(verified?.role).toBe('customer');

    const loginRes = store.loginUser({
      email: '  COMPRADOR@EXEMPLO.COM ',
      password: 'Password123',
    });
    expect(loginRes.user.uid).toBe(user.uid);
  });

  it('prevents duplicate registration for the same email', () => {
    store.registerUser({
      name: 'Cliente 1',
      email: 'dup@exemplo.com',
      password: 'Password123',
    });

    expect(() =>
      store.registerUser({
        name: 'Cliente 2',
        email: 'DUP@exemplo.com',
        password: 'Password456',
      })
    ).toThrow(/Conta já logada/);
  });

  it('requires SELLER_NOT_CLAIMED before admin registers first-run password, then grants admin role', () => {
    expect(store.hasSellerClaimed()).toBe(false);

    expect(() =>
      store.loginUser({
        email: ADMIN_EMAIL,
        password: 'SomePass99',
      })
    ).toThrow('SELLER_NOT_CLAIMED');

    const claimed = store.registerUser({
      name: 'Luiz Gustavo',
      email: ADMIN_EMAIL,
      password: 'SellerFirstPass99',
    });

    expect(claimed.user.role).toBe('admin');
    expect(store.hasSellerClaimed()).toBe(true);

    const login = store.loginUser({
      email: ADMIN_EMAIL,
      password: 'SellerFirstPass99',
    });
    expect(login.user.role).toBe('admin');
    expect(store.verifyToken(login.token)?.role).toBe('admin');
  });

  it('rejects wrong password and tampered HMAC tokens', () => {
    const { token } = store.registerUser({
      name: 'Cliente Seguro',
      email: 'seguro@exemplo.com',
      password: 'CorrectPassword1',
    });

    expect(() =>
      store.loginUser({
        email: 'seguro@exemplo.com',
        password: 'WrongPassword1',
      })
    ).toThrow(/incorretos/);

    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.tampered_sig`;
    expect(store.verifyToken(tampered)).toBeNull();
  });

  it('supports optional SELLER_ADMIN_PASSCODE env override with timing-safe check', () => {
    process.env.SELLER_ADMIN_PASSCODE = 'EnvPasscode2026';

    const ok = store.loginUser({
      email: ADMIN_EMAIL,
      password: 'EnvPasscode2026',
    });
    expect(ok.user.role).toBe('admin');

    expect(() =>
      store.loginUser({
        email: ADMIN_EMAIL,
        password: 'WrongPasscode',
      })
    ).toThrow(/incorreta/i);
  });

  it('allows changing password with current password verification', () => {
    store.registerUser({
      name: 'Vendedor',
      email: ADMIN_EMAIL,
      password: 'OldPassword123',
    });

    expect(() =>
      store.changePassword(ADMIN_EMAIL, 'WrongOldPass', 'NewPassword456')
    ).toThrow(/incorreta/i);

    store.changePassword(ADMIN_EMAIL, 'OldPassword123', 'NewPassword456');

    expect(() =>
      store.loginUser({ email: ADMIN_EMAIL, password: 'OldPassword123' })
    ).toThrow(/incorretos/i);

    const ok = store.loginUser({ email: ADMIN_EMAIL, password: 'NewPassword456' });
    expect(ok.user.role).toBe('admin');
  });
});
