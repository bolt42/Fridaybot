import { create } from 'zustand';
import { rtdb } from '../firebase/config';
import { ref, get as dbGet, set as dbSet, update as dbUpdate, onValue } from 'firebase/database';

interface User {
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
  initializeUser: (userData: { telegramId: string; username: string; language?: string }) => Promise<void>;
  updateBalance: (amount: number) => Promise<void>;
  subscribeUser: (telegramId: string) => void;
}


export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

initializeUser: async (userData) => {
  try {
    if (!userData?.telegramId) {
      throw new Error("telegramId is required to initialize user");
    }

    const userRef = ref(rtdb, 'users/' + userData.telegramId);
    const userSnap = await dbGet(userRef);

    if (userSnap.exists()) {
      const existingUser = userSnap.val();
      set({ user: existingUser, loading: false });
    } else {
      // new user
      const now = new Date().toISOString();
      const newUser: User = {
        telegramId: userData.telegramId,
        username: userData.username || `user_${userData.telegramId}`,
        balance: 50,
        gamesPlayed: 0,
        gamesWon: 0,
        totalWinnings: 0,
        language: userData.language ?? 'en',
        createdAt: now,
        updatedAt: now,
      };
      await dbSet(userRef, newUser);
      set({ user: newUser, loading: false });
    }

    // start real-time listener
    get().subscribeUser(userData.telegramId);

  } catch (error) {
    console.error('Error initializing user:', error);
    set({ user: null, loading: false });
  }
},
  updateBalance: async (amount: number) => {
    const { user } = get();
    if (!user) return;

    const userRef = ref(rtdb, 'users/' + user.telegramId);
    const newBalance = (user.balance || 0) + amount;
    const now = new Date().toISOString();

    try {
      await dbUpdate(userRef, { balance: newBalance, updatedAt: now });
      set({ user: { ...user, balance: newBalance, updatedAt: now } });
    } catch (error) {
      console.error('Error updating balance:', error);
      // fallback: update local
      set({ user: { ...user, balance: newBalance, updatedAt: now } });
    }
  },

  subscribeUser: (telegramId: string) => {
    const userRef = ref(rtdb, 'users/' + telegramId);
    onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        set({ user: snapshot.val(), loading: false });
      }
    });
  },
}));