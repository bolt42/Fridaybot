import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { rtdb } from '../firebase/config';
import { ref, update as dbUpdate } from 'firebase/database';

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
  updateBalance: (amount: number) => Promise<void>; // ✅ Add updateBalance function
}

// Use the persist middleware properly with the correct typing.
export const useAuthStore = create<AuthState>(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      initializeUser: (user: User) =>
        set({
          user,
          loading: false,
        }),
      logout: () => set({ user: null, loading: false }),
      updateBalance: async (amount: number) => {
        const state = get() as AuthState;
        const user = state.user;
        if (!user) return;
        
        const newBalance = (user.balance || 0) + amount;
        const updatedUser = { ...user, balance: newBalance };
        
        set({ user: updatedUser });
        
        // ✅ Update balance in Firebase
        try {
          const userRef = ref(rtdb, `users/${user.telegramId}`);
          await dbUpdate(userRef, { balance: newBalance });
        } catch (err) {
          console.error("❌ Error updating balance in Firebase:", err);
        }
      },
    }),
    {
      name: 'auth-storage', // The key for localStorage
      getStorage: () => localStorage, // Persist state to localStorage
    }
  ) as any // Cast to 'any' to resolve the typing error
);
