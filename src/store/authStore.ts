import { create } from 'zustand';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  balance?: number;
  createdAt?: Date;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  initializeUser: (userData: User) => Promise<void>;
  updateBalance: (amount: number) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  
  initializeUser: async (userData: User) => {
    try {
      // Check if we have a valid Firebase configuration
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID || import.meta.env.VITE_FIREBASE_PROJECT_ID === 'demo-project') {
        // Demo mode - use local storage
        const demoUser = {
          ...userData,
          balance: 50,
          createdAt: new Date()
        };
        set({ user: demoUser, loading: false });
        return;
      }
      
      const userRef = doc(db, 'users', userData.id);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const existingUser = userSnap.data();
        set({
          user: {
            ...userData,
            balance: existingUser.balance,
            createdAt: existingUser.createdAt?.toDate()
          },
          loading: false
        });
      } else {
        // New user - give 50 balance
        const newUser = {
          ...userData,
          balance: 50,
          createdAt: new Date()
        };
        
        await setDoc(userRef, newUser);
        set({ user: newUser, loading: false });
      }
    } catch (error) {
      console.error('Error initializing user:', error);
      // Fallback to demo mode if Firebase fails
      const demoUser = {
        ...userData,
        balance: 50,
        createdAt: new Date()
      };
      set({ user: demoUser, loading: false });
    }
  },
  
  updateBalance: async (amount: number) => {
    const { user } = get();
    if (!user) return;
    
    // Demo mode - update local state only
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID || import.meta.env.VITE_FIREBASE_PROJECT_ID === 'demo-project') {
      const newBalance = (user.balance || 0) + amount;
      set({
        user: { ...user, balance: newBalance }
      });
      return;
    }
    
    try {
      const userRef = doc(db, 'users', user.id);
      const newBalance = (user.balance || 0) + amount;
      
      await updateDoc(userRef, { balance: newBalance });
      set({
        user: { ...user, balance: newBalance }
      });
    } catch (error) {
      console.error('Error updating balance:', error);
      // Fallback to local update
      const newBalance = (user.balance || 0) + amount;
      set({
        user: { ...user, balance: newBalance }
      });
    }
  }
}));