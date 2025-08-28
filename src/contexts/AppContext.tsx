import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Room, Game } from '../types';
import { getDatabase, ref, onValue, update, get } from 'firebase/database';
import { app } from '../config/firebase';

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
    // Listen to rooms from Firebase Realtime Database
    const db = getDatabase(app);
    const roomsRef = ref(db, 'rooms');
    
    const unsubscribeRooms = onValue(roomsRef, (snapshot) => {
      const roomsData = snapshot.val();
      if (roomsData) {
        const roomsArray = Object.entries(roomsData).map(([id, roomData]: [string, any]) => ({
          id,
          name: roomData.name,
          betAmount: roomData.betAmount || 0,
          maxPlayers: roomData.maxPlayers || 10,
          isActive: roomData.status === 'active',
          isDemo: false,
          createdAt: new Date(roomData.createdAt),
          createdBy: roomData.createdBy || 'admin'
        })) as Room[];
        setRooms(roomsArray);
      } else {
        setRooms([]);
      }
    });

    return () => {
      unsubscribeRooms();
    };
  }, []);

  const updateUserBalance = async (amount: number) => {
    if (!user) return;
    
    const newBalance = user.balance + amount;
    const db = getDatabase(app);
    const userRef = ref(db, `users/${user.id}`);
    
    await update(userRef, {
      balance: newBalance,
      lastActive: Date.now()
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