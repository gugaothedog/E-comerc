import { auth } from './firebase';

let inMemoryServerToken: string | null = null;

export function setMemoryAuthToken(token: string | null): void {
  inMemoryServerToken = token;
}

export function getMemoryAuthToken(): string | null {
  return inMemoryServerToken;
}

export function isUsingServerSession(): boolean {
  return Boolean(inMemoryServerToken && !auth.currentUser);
}

export async function getActiveBearerToken(): Promise<string> {
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }
  if (inMemoryServerToken) {
    return inMemoryServerToken;
  }
  throw new Error('Usuário não autenticado.');
}
