import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Room, Game } from '../types';
import { collection, onSnapshot, doc, getDoc, updateDoc, addDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

interface AppContextType {
  user: User | null;
  rooms: Room[];
  currentGame: Game | null;
  language: 'en' | 'am';
  setLanguage: (lang: 'en' | 'am') => void;
  setUser: (user: User | null) => void;
  updateUserBalance: (amount: number) => Promise<void>;
  loading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [language, setLanguage] = useState<'en' | 'am'>('en');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize user from Telegram Web App
    const initUser = async () => {
      // Mock Telegram user for development
      const mockUser: User = {
        id: 'user-1',
        telegramId: '123456789',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        balance: 100,
        language: 'en',
        isAdmin: false,
        createdAt: new Date(),
        lastActive: new Date()
      };
      
      setUser(mockUser);
      setLoading(false);
    };

    initUser();
  }, []);

  useEffect(() => {
    // Listen to rooms
    const unsubscribeRooms = onSnapshot(
      query(collection(db, 'rooms'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const roomsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date()
        })) as Room[];
        setRooms(roomsData);
      }
    );

    return () => {
      unsubscribeRooms();
    };
  }, []);

  const updateUserBalance = async (amount: number) => {
    if (!user) return;
    
    const newBalance = user.balance + amount;
    const userRef = doc(db, 'users', user.id);
    
    await updateDoc(userRef, {
      balance: newBalance,
      lastActive: new Date()
    });
    
    setUser({ ...user, balance: newBalance });
  };

  const value: AppContextType = {
    user,
    rooms,
    currentGame,
    language,
    setLanguage,
    setUser,
    updateUserBalance,
    loading
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};