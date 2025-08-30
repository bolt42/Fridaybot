import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { rtdb } from '../firebase/config';
import { ref, get as dbGet, set as dbSet, update as dbUpdate, onValue } from 'firebase/database';

export interface User {
  telegramId: string;
  username: string;
  balance: number;
  gamesPlayed: number;
  gamesWon: number;
  totalWinnings: number;
  language: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  initializeUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>(
  persist(
    (set) => ({
      user: null,
      loading: true,
      initializeUser: (user) =>
        set({
          user,
          loading: false,
        }),
      logout: () => set({ user: null, loading: false }),
    }),
    {
      name: 'auth-storage', // The key for localStorage
      getStorage: () => localStorage, // Using localStorage for persistence
    }
  )
);
