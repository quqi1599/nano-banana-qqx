/**
 * 用户认证状态管理
 */
import { create } from 'zustand';
import {
    User,
    saveUser,
    clearAuth,
    getCurrentUser,
    getCreditBalance,
    logout as logoutApi,
} from '../services/authService';

interface AuthState {
    // 状态
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    // 方法
    setUser: (user: User | null) => void;
    login: (token: string, user: User) => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
    refreshCredits: () => Promise<void>;
    initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,

    setUser: (user) => set({ user, isAuthenticated: !!user }),

    login: (_token, user) => {
        saveUser(user);
        set({ user, isAuthenticated: true });
    },

    logout: () => {
        logoutApi().catch((error) => {
            console.error('Failed to logout:', error);
        });
        clearAuth();
        set({ user: null, isAuthenticated: false });
    },

    refreshUser: async () => {
        try {
            const user = await getCurrentUser();
            saveUser(user);
            set({ user, isAuthenticated: true });
        } catch (error) {
            console.error('Failed to refresh user:', error);
            const status = (error as { status?: number }).status;
            if (status === 401 || status === 403) {
                get().logout();
            }
        }
    },

    refreshCredits: async () => {
        try {
            const { balance } = await getCreditBalance();
            const currentUser = get().user;
            if (currentUser) {
                set({
                    user: { ...currentUser, credit_balance: balance }
                });
            }
        } catch (error) {
            console.error('Failed to refresh credits:', error);
        }
    },

    initAuth: async () => {
        set({ isLoading: true });
        try {
            const user = await getCurrentUser();
            saveUser(user);
            set({ user, isAuthenticated: true });
        } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 401 || status === 403) {
                clearAuth();
                set({ user: null, isAuthenticated: false });
            }
        } finally {
            set({ isLoading: false });
        }
    },
}));
