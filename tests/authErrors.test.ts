import { describe, it, expect } from 'vitest';
import { AuthFriendlyError, extractFirebaseAuthCode, formatAuthError } from '../src/lib/authErrors';

describe('formatAuthError', () => {
  it('extracts and translates auth/email-already-in-use into Portuguese', () => {
    const raw = new Error('Firebase: Error (auth/email-already-in-use).');
    expect(extractFirebaseAuthCode(raw)).toBe('auth/email-already-in-use');

    const formatted = formatAuthError(raw);
    expect(formatted).toBeInstanceOf(AuthFriendlyError);
    expect(formatted.code).toBe('auth/email-already-in-use');
    expect(formatted.message).toContain('Conta já logada');
  });

  it('extracts auth code from FirebaseError-shaped objects with .code', () => {
    const errObj = Object.assign(new Error('auth failure'), { code: 'auth/invalid-credential' });
    const formatted = formatAuthError(errObj);
    expect(formatted.code).toBe('auth/invalid-credential');
    expect(formatted.message).toContain('E-mail ou senha incorretos');
  });
});
