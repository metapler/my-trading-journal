import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, getMe, login as apiLogin, logout as apiLogout, register as apiRegister, type AuthUser } from '../api/client'

interface AuthContextValue {
  user: AuthUser | null;
  initializing: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session auth state (PLAN §21). The session cookie is HTTP-only (browser
 * managed); only the CSRF token lives in memory via the API client.
 * On boot, /api/auth/me restores the session — 401 means logged out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((e) => {
        // 401 = no session (normal logged-out state). Anything else surfaces.
        if (!cancelled && !(e instanceof ApiError && e.status === 401)) {
          setAuthError(e instanceof Error ? e.message : 'Session check failed.');
        }
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      const { user: u } = await apiLogin({ email, password });
      setUser(u);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Login failed.';
      setAuthError(msg);
      throw e;
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      const { user: u } = await apiRegister({ email, password });
      setUser(u);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Registration failed.';
      setAuthError(msg);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setAuthError(null);
    }
  }, []);

  const clearError = useCallback(() => setAuthError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, authError, login, register, logout, clearError }),
    [user, initializing, authError, login, register, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider.');
  return ctx;
}
