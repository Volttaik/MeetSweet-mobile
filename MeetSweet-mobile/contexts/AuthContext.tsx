import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { apiFetch, ApiError, refreshAccessToken, setSessionExpiredHandler } from '@/services/api';
import { clearUserCache } from '@/lib/posts-db';
import { clearChatCache } from '@/services/chat-cache';
import { realtime } from '@/services/realtime';
import { sweetStore } from '@/services/sweet-store';
import { uploadMedia } from '@/services/media';
import { peekPendingAvatar, clearPendingAvatar } from '@/lib/pending-avatar';
import {
  loadSession,
  saveSessionTokens,
  saveSessionUser,
  clearSessionStorage,
  getAccessToken,
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
  subscriptionPrice: number;
  subscriptionPlusPrice: number;
  category: string | null;
  isOnline: boolean;
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
  referral_code?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export type LoginResult =
  | { requiresTwoFactor: false }
  | { requiresTwoFactor: true; challengeToken: string };

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (data: LoginData) => Promise<LoginResult>;
  completeTwoFactorLogin: (challengeToken: string, code: string) => Promise<void>;
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
      subscriptionPrice: 0,
      subscriptionPlusPrice: 0,
      category: null,
      isOnline: false,
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
    subscriptionPrice: Number(raw.subscription_price ?? raw.subscriptionPrice ?? 0),
    subscriptionPlusPrice: Number(raw.subscription_plus_price ?? raw.subscriptionPlusPrice ?? 0),
    category: raw.category ? String(raw.category) : null,
    isOnline: Boolean(raw.is_online ?? raw.isOnline ?? false),
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

  // Register session-expired handler so API layer can clear auth state.
  // A dead session must never leave the user inside the authenticated app with
  // missing profile data — clear everything and land on Login immediately.
  useEffect(() => {
    setSessionExpiredHandler(async () => {
      await clearSessionStorage();
      // Chat cache is shared across accounts — wipe it so a session that expires
      // (rather than a clean logout) can never leak the prior user's messages.
      await clearChatCache().catch(() => {});
      setState({ user: null, accessToken: null, isLoading: false, isAuthenticated: false });
      // Pop every authenticated screen off the stack (so Back can never return
      // to protected screens) and show the Login screen directly.
      if (router.canDismiss()) router.dismissAll();
      router.replace('/auth');
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
    // apiFetch may have transparently refreshed an expired token and retried;
    // re-read the stored token so state never holds a stale (now-rejected)
    // access token that forces every subsequent request through another 401.
    const freshToken = await getAccessToken().catch(() => null);
    setState((s) => ({ ...s, user, accessToken: freshToken ?? token }));
    await saveSessionUser(user);
    return user;
  }, []);

  const doRefresh = useCallback(async (refreshToken: string) => {
    // Route through the SAME single-flight refresh used by apiFetch's 401
    // retry and the realtime client's 4401 handler. The server rotates the
    // refresh token on every use; two concurrent refreshes with the same token
    // would make one fail with "revoked or expired" and tear the session down.
    const fresh = await refreshAccessToken(refreshToken);
    if (!fresh) throw new Error('Refresh failed');
    const user = await fetchCurrentUser(fresh);
    setState({
      user,
      accessToken: fresh,
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

  // Unified realtime connection follows the auth session. The socket carries
  // the current user's identity (token from session storage); on logout or
  // account switch it is closed, and on login it reconnects with the new
  // account's token. The SweetStore starts/ends with the same session so the
  // canonical chat state is scoped to the signed-in account.
  useEffect(() => {
    if (state.isAuthenticated && state.user?.id) {
      realtime.connect();
      sweetStore.start(state.user.id);
    } else {
      realtime.disconnect();
      sweetStore.stop();
    }
  }, [state.isAuthenticated, state.user?.id]);

  // SweetSocket is also a session boundary. If the server invalidates the
  // session while the app is open, clear protected local state and leave the
  // authenticated navigation stack immediately; do not let the UI continue
  // rendering under a dead UID.
  useEffect(() => {
    const offExpired = realtime.on('auth:session:expired', () => {
      clearAuth().finally(() => {
        if (router.canDismiss()) router.dismissAll();
        router.replace('/auth');
      });
    });
    return offExpired;
  }, [clearAuth]);

  const login = useCallback(async (data: LoginData): Promise<LoginResult> => {
    await clearSessionStorage().catch(() => {});
    // A fresh login starts a clean account scope. Wipe any chat cache left over
    // from a prior user (e.g. session-expired → login as a different account).
    await clearChatCache().catch(() => {});

    const result = await apiFetch<{
      access_token?: string;
      refresh_token?: string;
      requires_2fa?: boolean;
      challenge_token?: string;
      user?: unknown;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: data.email, password: data.password }),
    });

    // 2FA-enabled account: the server returns a challenge instead of tokens.
    if (result.requires_2fa && result.challenge_token) {
      return { requiresTwoFactor: true, challengeToken: result.challenge_token };
    }

    if (!result.access_token || !result.refresh_token) {
      throw new Error('Login failed: no session token returned');
    }

    const user = normalizeUser(result.user);
    await saveSessionTokens(result.access_token, result.refresh_token, user);

    setState({
      user,
      accessToken: result.access_token,
      isLoading: false,
      isAuthenticated: true,
    });

    finalizePendingAvatar(user.email).catch(() => {});

    return { requiresTwoFactor: false };
  }, []);

  const completeTwoFactorLogin = useCallback(async (challengeToken: string, code: string) => {
    const result = await apiFetch<{
      access_token: string;
      refresh_token: string;
      user: unknown;
    }>('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ challenge_token: challengeToken, code }),
    });

    const user = normalizeUser(result.user);
    await saveSessionTokens(result.access_token, result.refresh_token, user);

    setState({
      user,
      accessToken: result.access_token,
      isLoading: false,
      isAuthenticated: true,
    });

    finalizePendingAvatar(user.email).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Upload any avatar the user chose during registration, now that a session
  // exists. Best-effort — a failed upload must never block login, and the
  // pending avatar is only cleared after the server confirms the save so a
  // transient network failure does not silently discard the user's chosen image.
  const finalizePendingAvatar = useCallback(async (userEmail: string | null | undefined) => {
    if (!userEmail) return;
    const pending = await peekPendingAvatar(userEmail);
    if (!pending) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      const { url } = await uploadMedia(
        pending.uri,
        pending.mimeType ?? 'image/jpeg',
        pending.fileName ?? 'avatar.jpg',
      );
      if (url && /^https?:\/\//i.test(url)) {
        await apiFetch('/users/me', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatar_url: url }),
        });
        await clearPendingAvatar(userEmail);
        await fetchCurrentUser(token);
      }
    } catch {
      // best-effort — never block the session; retried on the next login
    }
  }, [fetchCurrentUser]);

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
    <AuthContext.Provider value={{ ...state, login, completeTwoFactorLogin, register, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

