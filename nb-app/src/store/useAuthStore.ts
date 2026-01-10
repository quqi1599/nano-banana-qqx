/**
 * 用户认证状态管理
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
    User,
    getToken,
    getStoredUser,
    saveToken,
    saveUser,
    clearAuth,
    getCurrentUser,
    getCreditBalance,
} from '../services/authService';

interface AuthState {
    // 状态
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    // 方法
    setUser: (user: User | null) => void;
    setToken: (token: string | null) => void;
    login: (token: string, user: User) => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
    refreshCredits: () => Promise<void>;
    initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,

            setUser: (user) => set({ user, isAuthenticated: !!user }),

            setToken: (token) => {
                if (token) {
                    saveToken(token);
                }
                set({ token });
            },

            login: (token, user) => {
                saveToken(token);
                saveUser(user);
                set({ token, user, isAuthenticated: true });
            },

            logout: () => {
                clearAuth();
                set({ token: null, user: null, isAuthenticated: false });
            },

            refreshUser: async () => {
                const token = get().token || getToken();
                if (!token) return;

                try {
                    const user = await getCurrentUser();
                    set({ user, isAuthenticated: true });
                } catch (error) {
                    console.error('Failed to refresh user:', error);
                    const status = (error as { status?: number }).status;
                    if (status === 401 || status === 403) {
                        // Token 过期或无权限，清除登录状态
                        get().logout();
                    }
                }
            },

            refreshCredits: async () => {
                const token = get().token || getToken();
                if (!token) return;

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

                const token = getToken();
                const storedUser = getStoredUser();

                if (token && storedUser) {
                    set({ token, user: storedUser, isAuthenticated: true });
                    // 后台刷新用户信息
                    get().refreshUser().catch(console.error);
                }

                set({ isLoading: false });
            },
        }),
        {
            name: 'nbnb-auth-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                // 只持久化 token 和 user
                token: state.token,
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
