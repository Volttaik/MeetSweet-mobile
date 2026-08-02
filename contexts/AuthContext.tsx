import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBase, apiFetch } from '@/services/api';
import { clearUserCache } from '@/lib/posts-db';

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
  website: string | null;
  location: string | null;
  isVerified: boolean;
  isCreator: boolean;
  isVerifiedCreator: boolean;
  role: 'user' | 'creator' | 'admin';
  followerCount: number;
  followingCount: number;
  subscriberCount: number;
  postCount: number;
  createdAt: string;
}

export interface RegisterData {
  full_name: string;
  username: string;
  email: string;
  password: string;
  confirm_password: string;
  phone?: string;
}

export interface LoginData {
  email: string;
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
  register: (data: RegisterData) => Promise<{ userId: string }>;
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

// ─── Normalizer ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeUser(raw: any): User {
  return {
    id: raw.id,
    name: raw.full_name ?? raw.name ?? raw.display_name ?? '',
    username: raw.username ?? '',
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    bio: raw.bio ?? null,
    avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? null,
    bannerUrl: raw.banner_url ?? raw.bannerUrl ?? null,
    website: raw.website ?? null,
    location: raw.location ?? null,
    isVerified: raw.is_verified ?? raw.isVerified ?? false,
    isCreator: raw.is_creator ?? raw.isCreator ?? false,
    isVerifiedCreator: raw.is_verified_creator ?? raw.isVerifiedCreator ?? false,
    role: raw.role ?? 'user',
    followerCount: raw.follower_count ?? raw.followerCount ?? 0,
    followingCount: raw.following_count ?? raw.followingCount ?? 0,
    subscriberCount: raw.subscriber_count ?? raw.subscriberCount ?? 0,
    postCount: raw.post_count ?? raw.postCount ?? 0,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
    isAuthenticated: false,
  });

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

          // Refresh user in background
          fetchCurrentUser(accessToken).catch(async () => {
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

  const fetchCurrentUser = async (token: string): Promise<User> => {
    // GET /api/users/me returns the user object directly after envelope unwrap
    const raw = await apiFetch<unknown>('/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Backend may return { user: {...} } or the object directly after envelope unwrap
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = normalizeUser((raw as any)?.user ?? raw);
    setState((s) => ({ ...s, user }));
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
    return user;
  };

  const doRefresh = async (refreshToken: string) => {
    // POST /api/auth/refresh → { access_token, refresh_token }
    const data = await apiFetch<{ access_token: string; refresh_token: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, data.access_token);
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, data.refresh_token);
    const user = await fetchCurrentUser(data.access_token);
    setState((s) => ({
      ...s,
      accessToken: data.access_token,
      user,
      isAuthenticated: true,
    }));
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
    // POST /api/auth/login → { access_token, refresh_token, user }
    const result = await apiFetch<{
      access_token: string;
      refresh_token: string;
      user: unknown;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: data.email, password: data.password }),
    });
    const user = normalizeUser(result.user);
    await Promise.all([
      AsyncStorage.setItem(KEYS.ACCESS_TOKEN, result.access_token),
      AsyncStorage.setItem(KEYS.REFRESH_TOKEN, result.refresh_token),
      AsyncStorage.setItem(KEYS.USER, JSON.stringify(user)),
    ]);
    setState({
      user,
      accessToken: result.access_token,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<{ userId: string }> => {
    // POST /api/auth/register → { user_id } + sends verification email
    const result = await apiFetch<{ user_id: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { userId: result.user_id };
  }, []);

  const logout = useCallback(async () => {
    try {
      const accessToken = await AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
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
