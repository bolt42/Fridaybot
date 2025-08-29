import { create } from 'zustand';
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initializeUser: (user) =>
    set({
      user,
      loading: false,
    }),
  logout: () => set({ user: null, loading: false }),
}));