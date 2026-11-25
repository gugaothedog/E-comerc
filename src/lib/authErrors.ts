export class AuthFriendlyError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'auth/unknown') {
    super(message);
    this.name = 'AuthFriendlyError';
    this.code = code;
  }
}

export function extractFirebaseAuthCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string') {
    return (err as { code: string }).code;
  }
  const msg = err instanceof Error ? err.message : String(err || '');
  const match = msg.match(/\((auth\/[a-z0-9-]+)\)/i) || msg.match(/\b(auth\/[a-z0-9-]+)\b/i);
  return match ? match[1].toLowerCase() : null;
}

export function formatAuthError(err: unknown): AuthFriendlyError {
  if (err instanceof AuthFriendlyError) return err;

  const code = extractFirebaseAuthCode(err);
  switch (code) {
    case 'auth/email-already-in-use':
      return new AuthFriendlyError(
        'Conta já logada ou cadastrada com este e-mail. Use a aba "Entrar", clique em "Continuar com Google" ou acesse "Recuperar" para definir sua senha.',
        code
      );
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return new AuthFriendlyError(
        'E-mail ou senha incorretos. Se esta conta usa Google e ainda não possui senha cadastrada, clique em "Continuar com Google" ou use "Recuperar" para criar uma senha.',
        code
      );
    case 'auth/user-not-found':
      return new AuthFriendlyError(
        'Nenhuma conta encontrada com este e-mail. Use a aba "Criar conta" para se cadastrar.',
        code
      );
    case 'auth/weak-password':
      return new AuthFriendlyError('A senha deve ter pelo menos 6 caracteres.', code);
    case 'auth/invalid-email':
      return new AuthFriendlyError('Informe um endereço de e-mail válido.', code);
    case 'auth/too-many-requests':
      return new AuthFriendlyError(
        'Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.',
        code
      );
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return new AuthFriendlyError('O login com Google foi cancelado antes de concluir.', code);
    case 'auth/popup-blocked':
      return new AuthFriendlyError(
        'O navegador bloqueou a janela do Google. Permita pop-ups para continuar.',
        code
      );
    case 'auth/provider-already-linked':
    case 'auth/credential-already-in-use':
      return new AuthFriendlyError('Este método de acesso já está vinculado à sua conta.', code);
    case 'auth/requires-recent-login':
      return new AuthFriendlyError(
        'Por segurança, confirme seu login novamente antes de alterar a senha.',
        code
      );
    default: {
      const raw = err instanceof Error ? err.message : 'Erro ao autenticar.';
      return new AuthFriendlyError(raw, code || 'auth/unknown');
    }
  }
}
