import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { apiFetch, ApiError, setSessionExpiredHandler } from '@/services/api';
import { clearUserCache } from '@/lib/posts-db';
import { clearChatCache } from '@/services/chat-cache';
import {
  loadSession,
  saveSessionTokens,
  saveSessionUser,
  clearSessionStorage,
  getAccessToken,
  updateAccessToken,
  updateRefreshToken,
} from '@/lib/session-storage';

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
  subscriberCount: number;
  subscribingCount: number;
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
  bio?: string;
  date_of_birth?: string;
  dob?: string;
  avatar_url?: string;
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
  updateUser: (user: Partial<User> | User) => void;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeUser(raw: any): User {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      name: '',
      username: '',
      email: null,
      phone: null,
      bio: null,
      avatarUrl: null,
      bannerUrl: null,
      website: null,
      location: null,
      isVerified: false,
      isCreator: false,
      isVerifiedCreator: false,
      role: 'user',
      subscriberCount: 0,
      subscribingCount: 0,
      postCount: 0,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    id: String(raw.id ?? raw.user_id ?? raw._id ?? ''),
    name: String(raw.name ?? raw.full_name ?? raw.display_name ?? raw.username ?? ''),
    username: String(raw.username ?? ''),
    email: raw.email ? String(raw.email) : null,
    phone: raw.phone ? String(raw.phone) : null,
    bio: raw.bio ? String(raw.bio) : null,
    avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? raw.profile_picture_url ?? null,
    bannerUrl: raw.banner_url ?? raw.bannerUrl ?? null,
    website: raw.website ? String(raw.website) : null,
    location: raw.location ? String(raw.location) : null,
    isVerified: Boolean(raw.is_verified ?? raw.isVerified ?? false),
    isCreator: Boolean(raw.is_creator ?? raw.isCreator ?? raw.is_verified_creator ?? raw.isVerifiedCreator ?? false),
    isVerifiedCreator: Boolean(raw.is_verified_creator ?? raw.isVerifiedCreator ?? false),
    role: (raw.role === 'admin' || raw.role === 'creator' || raw.role === 'user') ? raw.role : 'user',
    subscriberCount: Number(raw.subscriber_count ?? raw.subscriberCount ?? raw.subscribers_count ?? raw.subscribersCount ?? 0),
    subscribingCount: Number(raw.subscription_count ?? raw.subscriptionCount ?? raw.subscribing_count ?? raw.subscribingCount ?? raw.following_count ?? raw.followingCount ?? 0),
    postCount: Number(raw.post_count ?? raw.postCount ?? raw.posts_count ?? raw.postsCount ?? 0),
    createdAt: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
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

  const clearAuth = useCallback(async () => {
    const currentUserId = state.user?.id;
    await clearSessionStorage();
    if (currentUserId) {
      await clearUserCache(currentUserId).catch(() => {});
    }
    // Chat cache is shared across accounts — clear it so the next login never
    // exposes the previous user's private conversations.
    await clearChatCache().catch(() => {});
    setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false });
  }, [state.user?.id]);

  // Register session-expired handler so API layer can clear auth state
  useEffect(() => {
    setSessionExpiredHandler(async () => {
      await clearSessionStorage();
      setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false });
    });
    return () => {
      setSessionExpiredHandler(() => {});
    };
  }, []);

  const fetchCurrentUser = useCallback(async (token: string): Promise<User> => {
    const raw = await apiFetch<unknown>('/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = normalizeUser((raw as any)?.user ?? raw);
    setState((s) => ({ ...s, user }));
    await saveSessionUser(user);
    return user;
  }, []);

  const doRefresh = useCallback(async (refreshToken: string) => {
    const data = await apiFetch<{ access_token: string; refresh_token: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    await updateAccessToken(data.access_token);
    if (data.refresh_token) {
      await updateRefreshToken(data.refresh_token);
    }
    const user = await fetchCurrentUser(data.access_token);
    setState({
      user,
      accessToken: data.access_token,
      isLoading: false,
      isAuthenticated: true,
    });
  }, [fetchCurrentUser]);

  // Load persisted auth from SQLite / AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const { accessToken, refreshToken, user } = await loadSession();

        if (accessToken && user) {
          // Immediately set cached session so user is logged in instantly
          setState({ user, accessToken, isLoading: false, isAuthenticated: true });

          // Refresh user profile in background
          try {
            await fetchCurrentUser(accessToken);
          } catch (err) {
            // Only invalidate session if backend explicitly rejected with 401
            if (err instanceof ApiError && err.status === 401) {
              if (refreshToken) {
                try {
                  await doRefresh(refreshToken);
                } catch {
                  await clearAuth();
                }
              } else {
                await clearAuth();
              }
            }
            // Offline / network errors keep the cached user session intact!
          }
        } else {
          // If storage had partial/corrupted auth state, purge it
          if (accessToken || user) {
            await clearAuth();
          } else {
            setState((s) => ({ ...s, isLoading: false }));
          }
        }
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, [fetchCurrentUser, doRefresh, clearAuth]);

  // Revalidate session when app transitions back to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && state.isAuthenticated && state.accessToken) {
        fetchCurrentUser(state.accessToken).catch(() => {});
      }
    });
    return () => {
      subscription.remove();
    };
  }, [state.isAuthenticated, state.accessToken, fetchCurrentUser]);

  const login = useCallback(async (data: LoginData) => {
    await clearSessionStorage().catch(() => {});

    const result = await apiFetch<{
      access_token: string;
      refresh_token: string;
      user: unknown;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: data.email, password: data.password }),
    });

    const user = normalizeUser(result.user);
    await saveSessionTokens(result.access_token, result.refresh_token, user);

    setState({
      user,
      accessToken: result.access_token,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<{ userId: string }> => {
    const result = await apiFetch<{ user_id?: string; id?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { userId: result.user_id || result.id || '' };
  }, []);

  const logout = useCallback(async () => {
    try {
      const accessToken = await getAccessToken();
      if (accessToken) {
        await apiFetch('/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});
      }
    } finally {
      await clearAuth();
    }
  }, [clearAuth]);

  const refreshUser = useCallback(async () => {
    const token = await getAccessToken();
    if (token) {
      await fetchCurrentUser(token);
    }
  }, [fetchCurrentUser]);

  const updateUser = useCallback((updated: Partial<User> | User) => {
    setState((s) => {
      if (!s.user) return s;
      const newUser = { ...s.user, ...updated };
      saveSessionUser(newUser).catch(() => {});
      return { ...s, user: newUser };
    });
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

