import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuthFriendlyError } from '../lib/authErrors';
import { navigate } from '../lib/router';

export function CustomerAuthPage({ searchParams }: { searchParams: string }) {
  const { authUser, isSeller, loginWithGoogle, loginWithEmail, registerWithEmail, sendPasswordReset } = useAuth();
  const redirectTarget = new URLSearchParams(searchParams).get('redirect') || '/minha-conta';

  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (authUser) {
      navigate(isSeller ? '/vendedor/dashboard' : redirectTarget);
    }
  }, [authUser, isSeller, redirectTarget]);

  const hasGmailTypo = email.trim().toLowerCase().endsWith('@gmai.com');

  const routeAfterAuth = (role: string) => {
    if (role === 'admin' || role === 'seller') {
      navigate('/vendedor/dashboard');
    } else {
      navigate(redirectTarget);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setErrorCode(null);
    setInfoMsg(null);
    try {
      if (mode === 'login') {
        const res = await loginWithEmail(email, password);
        routeAfterAuth(res.role);
      } else if (mode === 'register') {
        const res = await registerWithEmail(name, email, password);
        routeAfterAuth(res.role);
      } else {
        await sendPasswordReset(email);
        setInfoMsg('Enviamos as instruções para definir ou redefinir sua senha para o seu e-mail.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao autenticar.';
      if (msg === 'SELLER_NOT_CLAIMED') {
        setMode('register');
        setInfoMsg('Primeiro acesso do vendedor identificado! Informe seu nome e defina sua senha abaixo para ativar sua conta de administrador.');
      } else {
        setErrorMsg(msg);
        setErrorCode(err instanceof AuthFriendlyError ? err.code : null);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setErrorMsg(null);
    setErrorCode(null);
    try {
      const res = await loginWithGoogle();
      routeAfterAuth(res.role);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao entrar com Google.');
      setErrorCode(err instanceof AuthFriendlyError ? err.code : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-14">
      <div className="border border-zinc-200 rounded-2xl p-6 sm:p-8 bg-white space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-zinc-950">
            {mode === 'login' && 'Entrar na sua conta'}
            {mode === 'register' && 'Criar conta'}
            {mode === 'reset' && 'Definir / Recuperar senha'}
          </h1>
          <p className="text-xs text-zinc-500">
            Acesse sua conta PASSO URBANO para acompanhar pedidos ou gerenciar a loja.
          </p>
        </div>

        <div className="flex gap-1 p-1 bg-zinc-100 rounded-lg">
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(null); setErrorCode(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${mode === 'login' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setErrorMsg(null); setErrorCode(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${mode === 'register' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'}`}
          >
            Criar conta
          </button>
          <button
            type="button"
            onClick={() => { setMode('reset'); setErrorMsg(null); setErrorCode(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${mode === 'reset' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'}`}
          >
            Recuperar
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-800 rounded-lg space-y-2.5">
            <p>{errorMsg}</p>
            {(errorCode === 'auth/email-already-in-use' ||
              errorCode === 'auth/invalid-credential' ||
              errorCode === 'auth/wrong-password') && (
              <div className="flex flex-wrap gap-2 pt-1">
                {mode !== 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setErrorMsg(null); setErrorCode(null); }}
                    className="px-2.5 py-1 bg-white border border-red-300 text-red-900 font-semibold rounded-md hover:bg-red-100 cursor-pointer"
                  >
                    Ir para Entrar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setErrorMsg(null); setErrorCode(null); }}
                  className="px-2.5 py-1 bg-white border border-red-300 text-red-900 font-semibold rounded-md hover:bg-red-100 cursor-pointer"
                >
                  Definir / Recuperar senha
                </button>
                <button
                  type="button"
                  onClick={handleGoogle}
                  className="px-2.5 py-1 bg-zinc-950 text-white font-semibold rounded-md hover:bg-zinc-800 cursor-pointer"
                >
                  Continuar com Google
                </button>
              </div>
            )}
          </div>
        )}
        {infoMsg && (
          <div className="p-3 text-xs bg-lime-50 border border-lime-200 text-lime-900 rounded-lg">
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1">Nome completo</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-zinc-700 block mb-1">E-mail</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg"
            />
            {hasGmailTypo && (
              <div className="mt-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center justify-between gap-2">
                <span>Você quis dizer <strong>@gmail.com</strong>?</span>
                <button
                  type="button"
                  onClick={() => setEmail(email.trim().replace(/@gmai\.com$/i, '@gmail.com'))}
                  className="underline font-semibold cursor-pointer shrink-0"
                >
                  Corrigir
                </button>
              </div>
            )}
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1">Senha</label>
              <input
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 text-sm font-bold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
          >
            {busy
              ? 'Processando...'
              : mode === 'login'
              ? 'Entrar com e-mail'
              : mode === 'register'
              ? 'Criar minha conta'
              : 'Enviar link de recuperação'}
          </button>
        </form>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-zinc-200" />
          <span className="shrink mx-3 text-xs text-zinc-400">ou</span>
          <div className="flex-grow border-t border-zinc-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="w-full py-2.5 px-4 text-sm font-semibold border border-zinc-300 text-zinc-900 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer"
        >
          Continuar com Google
        </button>
      </div>
    </main>
  );
}
