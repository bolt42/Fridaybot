export interface User {
  id: string;
  telegramId: string;
  username: string;
  firstName?: string;
  lastName?: string;
  balance: number;
  language: 'en' | 'am';
  isAdmin: boolean;
  createdAt: Date;
  lastActive: Date;
}

export interface Room {
  id: string;
  name: string;
  betAmount: number;
  maxPlayers: number;
  isActive: boolean;
  isDemo: boolean;
  currentGameId?: string;
  createdAt: Date;
  createdBy: string;
}

export interface BingoCard {
  id: string;
  serialNumber: number;
  numbers: {
    B: number[];
    I: number[];
    N: number[];
    G: number[];
    O: number[];
  };
  roomId: string;
  isAvailable: boolean;
}

export interface Game {
  id: string;
  roomId: string;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  players: GamePlayer[];
  drawnNumbers: number[];
  startTime?: Date;
  endTime?: Date;
  winnerId?: string;
  totalPot: number;
  countdownStart?: Date;
}

export interface GamePlayer {
  userId: string;
  username: string;
  cardId: string;
  markedNumbers: number[];
  hasBingo: boolean;
  betAmount: number;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'bet' | 'win';
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  method?: 'cbe' | 'telebirr';
  details?: any;
  adminId?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  username: string;
  amount: number;
  accountType: 'bank' | 'telebirr';
  accountDetails: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  requestedAt: Date;
  processedAt?: Date;
  processedBy?: string;
}