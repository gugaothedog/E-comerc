import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { extractFirebaseAuthCode, formatAuthError } from '../lib/authErrors';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getMemoryAuthToken, setMemoryAuthToken } from '../lib/sessionToken';
import type { UserPrivateInfo, UserProfile, UserRole } from '../types/store';

export const ADMIN_BOOTSTRAP_EMAIL = 'luizgustavo14102010@gmail.com';

export interface UnifiedAuthUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  source: 'firebase' | 'server';
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  authUser: UnifiedAuthUser | null;
  profile: UserProfile | null;
  privateInfo: UserPrivateInfo | null;
  loading: boolean;
  isSeller: boolean;
  isAdmin: boolean;
  hasPasswordProvider: boolean;
  loginWithGoogle: () => Promise<{ role: UserRole }>;
  loginWithEmail: (email: string, password: string) => Promise<{ role: UserRole }>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<{ role: UserRole }>;
  changeSitePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  linkPasswordToGoogleAccount: (newPassword: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  updateCustomerProfile: (name: string, phone: string, cpf: string, addresses: UserPrivateInfo['addresses']) => Promise<void>;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const SITE_EPOCH_KEY = 'passo_urbano_site_epoch';
const CURRENT_SITE_EPOCH = 'v2_clean';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authUser, setAuthUser] = useState<UnifiedAuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [role, setRole] = useState<UserRole>('customer');
  const [loading, setLoading] = useState(true);

  const loadFirebaseUserRecords = async (fbUser: FirebaseUser): Promise<UserRole> => {
    let resolvedRole: UserRole = 'customer';

    const isBootstrapAdmin = fbUser.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL && fbUser.emailVerified;
    if (isBootstrapAdmin) {
      resolvedRole = 'admin';
    } else {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
        if (adminSnap.exists()) {
          resolvedRole = 'admin';
        } else {
          const sellerSnap = await getDoc(doc(db, 'sellers', fbUser.uid));
          if (sellerSnap.exists() && sellerSnap.data()?.active === true) {
            resolvedRole = 'seller';
          }
        }
      } catch {
        // Cliente padrão
      }
    }

    const userRef = doc(db, 'users', fbUser.uid);
    try {
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        const newProfile: UserProfile = {
          uid: fbUser.uid,
          name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Cliente Passo Urbano',
          email: fbUser.email || '',
          role: 'customer',
          totalOrders: 0,
          totalSpent: 0,
        };
        await setDoc(userRef, {
          ...newProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setProfile({ ...newProfile, role: resolvedRole });
      } else {
        const data = userSnap.data() as UserProfile;
        setProfile({ ...data, role: resolvedRole });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${fbUser.uid}`);
    }

    try {
      const privSnap = await getDoc(doc(db, 'users', fbUser.uid, 'private', 'info'));
      if (privSnap.exists()) {
        setPrivateInfo(privSnap.data() as UserPrivateInfo);
      } else {
        setPrivateInfo({ uid: fbUser.uid, phone: '', cpf: '', addresses: [] });
      }
    } catch {
      setPrivateInfo({ uid: fbUser.uid, phone: '', cpf: '', addresses: [] });
    }

    setAuthUser({
      uid: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Cliente Passo Urbano',
      emailVerified: fbUser.emailVerified,
      source: 'firebase',
    });
    setRole(resolvedRole);
    return resolvedRole;
  };

  const applyServerSession = (user: {
    uid: string;
    name: string;
    email: string;
    role: UserRole;
    phone?: string;
    cpf?: string;
    addresses?: UserPrivateInfo['addresses'];
  }, token: string): UserRole => {
    setMemoryAuthToken(token);
    setAuthUser({
      uid: user.uid,
      email: user.email,
      displayName: user.name,
      emailVerified: true,
      source: 'server',
    });
    setProfile({
      uid: user.uid,
      name: user.name,
      email: user.email,
      role: user.role,
      totalOrders: 0,
      totalSpent: 0,
    });
    setPrivateInfo({
      uid: user.uid,
      phone: user.phone || '',
      cpf: user.cpf || '',
      addresses: user.addresses || [],
    });
    setRole(user.role);
    return user.role;
  };

  useEffect(() => {
    let resetHandled = false;
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!resetHandled && typeof window !== 'undefined') {
        resetHandled = true;
        try {
          if (window.localStorage.getItem(SITE_EPOCH_KEY) !== CURRENT_SITE_EPOCH) {
            window.localStorage.removeItem('passo_urbano_cart_v1');
            window.localStorage.setItem(SITE_EPOCH_KEY, CURRENT_SITE_EPOCH);
            if (fbUser) {
              await signOut(auth).catch(() => undefined);
              setFirebaseUser(null);
              setAuthUser(null);
              setProfile(null);
              setPrivateInfo(null);
              setRole('customer');
              setLoading(false);
              return;
            }
          }
        } catch {
          // Ignore storage error
        }
      }

      setFirebaseUser(fbUser);
      if (fbUser) {
        setMemoryAuthToken(null);
        try {
          await loadFirebaseUserRecords(fbUser);
        } catch (err) {
          console.error('Erro ao carregar perfil:', err);
        }
      } else if (!getMemoryAuthToken()) {
        setAuthUser(null);
        setProfile(null);
        setPrivateInfo(null);
        setRole('customer');
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const loginWithGoogle = async () => {
    setMemoryAuthToken(null);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const resolvedRole = await loadFirebaseUserRecords(cred.user);
      return { role: resolvedRole };
    } catch (fbErr) {
      throw formatAuthError(fbErr);
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    const normalized = email.trim().toLowerCase();
    // Garante isolamento total deste site: encerra eventual sessão compartilhada do navegador antes de autenticar neste site
    if (auth.currentUser) {
      await signOut(auth).catch(() => undefined);
    }
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized, password }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      if (data.code === 'SELLER_NOT_CLAIMED') {
        throw new Error('SELLER_NOT_CLAIMED');
      }
      throw new Error(data.error || 'E-mail ou senha incorretos.');
    }
    const resolvedRole = applyServerSession(data.user, data.token);
    return { role: resolvedRole };
  };

  const registerWithEmail = async (name: string, email: string, password: string) => {
    const normalized = email.trim().toLowerCase();
    // Garante que cada conta de E-mail/Senha seja criada apenas para este site, sem conflitar com outros projetos Firebase
    if (auth.currentUser) {
      await signOut(auth).catch(() => undefined);
    }
    const resp = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: normalized, password }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || 'Não foi possível criar sua conta.');
    }
    const resolvedRole = applyServerSession(data.user, data.token);
    return { role: resolvedRole };
  };

  const changeSitePassword = async (currentPassword: string, newPassword: string) => {
    const token = getMemoryAuthToken();
    if (!token) throw new Error('Faça login com e-mail e senha para alterar a senha.');
    const resp = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || 'Não foi possível alterar a senha.');
    }
  };

  const linkPasswordToGoogleAccount = async (newPassword: string) => {
    const current = auth.currentUser;
    if (!current || !current.email) {
      throw new Error('Entre com sua conta Google primeiro.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('A senha deve ter pelo menos 6 caracteres.');
    }
    const credential = EmailAuthProvider.credential(current.email, newPassword);
    try {
      await linkWithCredential(current, credential);
      await current.reload();
      setFirebaseUser(auth.currentUser);
    } catch (err) {
      const code = extractFirebaseAuthCode(err);
      if (code === 'auth/requires-recent-login') {
        try {
          await reauthenticateWithPopup(current, new GoogleAuthProvider());
          await linkWithCredential(current, credential);
          await current.reload();
          setFirebaseUser(auth.currentUser);
          return;
        } catch (reauthErr) {
          throw formatAuthError(reauthErr);
        }
      }
      throw formatAuthError(err);
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    } catch (err) {
      throw formatAuthError(err);
    }
  };

  const resendVerification = async () => {
    if (!auth.currentUser) throw new Error('Faça login primeiro.');
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      throw formatAuthError(err);
    }
  };

  const updateCustomerProfile = async (
    name: string,
    phone: string,
    cpf: string,
    addresses: UserPrivateInfo['addresses']
  ) => {
    if (!authUser) throw new Error('Usuário não autenticado.');

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          name: name.trim().slice(0, 120),
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'users', firebaseUser.uid, 'private', 'info'), {
          uid: firebaseUser.uid,
          phone: phone.trim().slice(0, 30),
          cpf: cpf.trim().slice(0, 20),
          addresses: addresses.slice(0, 10),
          updatedAt: serverTimestamp(),
        });
        await loadFirebaseUserRecords(firebaseUser);
        return;
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
    }

    const token = getMemoryAuthToken();
    if (!token) throw new Error('Sessão expirada.');
    const resp = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, phone, cpf, addresses }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro ao atualizar perfil.');
    applyServerSession(data.user, token);
  };

  const logout = async () => {
    setMemoryAuthToken(null);
    setAuthUser(null);
    setProfile(null);
    setPrivateInfo(null);
    setRole('customer');
    if (auth.currentUser) {
      await signOut(auth);
    }
  };

  const refreshUserData = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      await loadFirebaseUserRecords(auth.currentUser);
      return;
    }
    const token = getMemoryAuthToken();
    if (token) {
      const resp = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        applyServerSession(data.user, token);
      }
    }
  };

  const hasPasswordProvider = Boolean(
    firebaseUser?.providerData?.some((p) => p.providerId === 'password')
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authUser,
        profile,
        privateInfo,
        loading,
        isSeller: role === 'seller' || role === 'admin',
        isAdmin: role === 'admin',
        hasPasswordProvider,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        changeSitePassword,
        linkPasswordToGoogleAccount,
        sendPasswordReset,
        resendVerification,
        updateCustomerProfile,
        logout,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
