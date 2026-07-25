import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthTokenGetter, setBaseUrl } from '@/lib/api-client-react';
import { getApiBase, apiFetch, setAuthExpiredHandler } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  isVerified: boolean;
  isCreator: boolean;
  credits: number;
  followerCount: number;
  followingCount: number;
  subscriberCount: number;
  postCount: number;
  createdAt: string;
}

export interface RegisterData {
  name: string;
  username?: string;
  email?: string;
  phone?: string;
  password: string;
  bio?: string;
  avatarUrl?: string;
}

function normalizeUser(raw: any): User {
  return {
    id: String(raw.id),
    name: raw.name ?? raw.full_name ?? raw.display_name ?? '',
    username: raw.username ?? '',
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    bio: raw.bio ?? null,
    avatarUrl: raw.avatarUrl ?? raw.avatar_url ?? null,
    bannerUrl: raw.bannerUrl ?? raw.banner_url ?? null,
    isVerified: raw.isVerified ?? raw.is_verified ?? false,
    isCreator: raw.isCreator ?? raw.is_creator ?? false,
    credits: raw.credits ?? raw.credit_balance ?? 0,
    followerCount: raw.followerCount ?? raw.follower_count ?? 0,
    followingCount: raw.followingCount ?? raw.following_count ?? 0,
    subscriberCount: raw.subscriberCount ?? raw.subscriber_count ?? 0,
    postCount: raw.postCount ?? raw.post_count ?? 0,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date(0).toISOString(),
  };
}

export interface LoginData {
  identifier: string;
  password: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (user: User) => void;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEYS = {
  ACCESS_TOKEN: '@ms_access_token',
  REFRESH_TOKEN: '@ms_refresh_token',
  USER: '@ms_user',
} as const;

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Configure the generated client against the standalone server.
  useEffect(() => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    setBaseUrl((apiUrl || getApiBase().replace(/\/api$/, '')).replace(/\/+$/, ''));
    setAuthTokenGetter(async () => {
      return await AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
    });
    setAuthExpiredHandler(() => {
      void clearAuth();
    });
    return () => setAuthExpiredHandler(null);
  }, []);

  // Load persisted auth on mount
  useEffect(() => {
    (async () => {
      try {
        const [accessToken, userJson, refreshToken] = await Promise.all([
          AsyncStorage.getItem(KEYS.ACCESS_TOKEN),
          AsyncStorage.getItem(KEYS.USER),
          AsyncStorage.getItem(KEYS.REFRESH_TOKEN),
        ]);

        if (accessToken && userJson) {
          const user = JSON.parse(userJson) as User;
          setState({ user, accessToken, isLoading: false, isAuthenticated: true });

          // Try to refresh user data in background
          fetchCurrentUser(accessToken).catch(async () => {
            // Access token might be expired — try refresh
            if (refreshToken) {
              try {
                await doRefresh(refreshToken);
              } catch {
                await clearAuth();
              }
            } else {
              await clearAuth();
            }
          });
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  const fetchCurrentUser = async (token: string) => {
    const data = await apiFetch<any>('/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = normalizeUser(data.user ?? data);
    setState((s) => ({ ...s, user }));
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
    return user;
  };

  const doRefresh = async (refreshToken: string) => {
    const data = await apiFetch<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken, refresh_token: refreshToken }),
    });
    const accessToken = data.accessToken ?? (data as any).access_token;
    const nextRefreshToken = data.refreshToken ?? (data as any).refresh_token ?? refreshToken;
    if (!accessToken) throw new Error('Refresh succeeded but no access token was returned');
    await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, accessToken);
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, nextRefreshToken);
    const user = await fetchCurrentUser(accessToken);
    setState((s) => ({ ...s, accessToken, user, isAuthenticated: true }));
  };

  const clearAuth = async () => {
    await Promise.all([
      AsyncStorage.removeItem(KEYS.ACCESS_TOKEN),
      AsyncStorage.removeItem(KEYS.REFRESH_TOKEN),
      AsyncStorage.removeItem(KEYS.USER),
    ]);
    setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false });
  };

  const login = useCallback(async (data: LoginData) => {
    const result = await apiFetch<{ user: User; accessToken: string; refreshToken: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: data.identifier.trim().toLowerCase(), password: data.password }),
      },
    );
    const accessToken = result.accessToken ?? (result as any).access_token;
    const refreshToken = result.refreshToken ?? (result as any).refresh_token;
    if (!accessToken) throw new Error('Login succeeded but no access token was returned');
    await Promise.all([
      AsyncStorage.setItem(KEYS.ACCESS_TOKEN, accessToken),
      AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken ?? ''),
      AsyncStorage.setItem(KEYS.USER, JSON.stringify(normalizeUser(result.user))),
    ]);
    setState({
      user: normalizeUser(result.user),
      accessToken,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const result = await apiFetch<{
      user?: User;
      user_id?: string;
      accessToken?: string;
      refreshToken?: string;
      access_token?: string;
      refresh_token?: string;
    }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          full_name: data.name,
          username: data.username,
          email: data.email,
          phone: data.phone,
          password: data.password,
          confirm_password: data.password,
          bio: data.bio,
          avatar_url: data.avatarUrl,
        }),
      },
    );
    const accessToken = result.accessToken ?? result.access_token;
    const refreshToken = result.refreshToken ?? result.refresh_token;
    // The deployed API intentionally requires email verification before
    // issuing a session. The verify-email screen is the next step.
    if (!accessToken) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    if (!result.user) throw new Error('Registration succeeded but no user was returned');
    await Promise.all([
      AsyncStorage.setItem(KEYS.ACCESS_TOKEN, accessToken),
      AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken ?? ''),
      AsyncStorage.setItem(KEYS.USER, JSON.stringify(normalizeUser(result.user))),
    ]);
    setState({
      user: normalizeUser(result.user),
      accessToken,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      const refreshToken = await AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
      const accessToken = await AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    } finally {
      await clearAuth();
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = await AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
    if (token) {
      await fetchCurrentUser(token);
    }
  }, []);

  const updateUser = useCallback((user: User) => {
    setState((s) => ({ ...s, user }));
    AsyncStorage.setItem(KEYS.USER, JSON.stringify(user)).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
