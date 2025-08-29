import { create } from 'zustand';
import { rtdb } from '../firebase/config';
import { ref, onValue, get, set as fbset , update } from 'firebase/database';

interface BingoCard {
  id: string;
  numbers: number[][];
  serialNumber: number;
  claimed: boolean;
  claimedBy?: string;
}

interface Room {
  id: string;
  name: string;
  betAmount: number;
  maxPlayers: number;
  isActive: boolean;
  isDemoRoom: boolean;
  currentPlayers: number;
  gameStatus: 'waiting' | 'countdown' | 'playing' | 'ended';
  calledNumbers: number[];
  winner?: string;
  payout?: number;
}

interface GameState {
  rooms: Room[];
  currentRoom: Room | null;
  selectedCard: BingoCard | null;
  bingoCards: BingoCard[];
  loading: boolean;
  fetchRooms: () => void;
  joinRoom: (roomId: string) => void;
  selectCard: (cardId: string) => void;
  placeBet: () => Promise<boolean>;
  checkBingo: () => Promise<boolean>;
  generateBingoCards: (count: number) => BingoCard[];
}

export const useGameStore = create<GameState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  selectedCard: null,
  bingoCards: [],
  loading: false,
  
  fetchRooms: () => {
    const roomsRef = ref(rtdb, 'rooms');
    onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      const rooms: Room[] = data
        ? Object.entries(data).map(([id, value]: [string, any]) => ({ id, ...value }))
        : [];
      set({ rooms });
    });
  },
  
  joinRoom: (roomId: string) => {
    const { rooms } = get();
    const room = rooms.find(r => r.id === roomId);
    
    if (room) {
      set({ currentRoom: room });
      
      // Subscribe to room updates
      const roomRef = ref(rtdb, 'rooms/' + roomId);
      onValue(roomRef, (snapshot) => {
        if (snapshot.exists()) {
          const updatedRoom = { id: roomId, ...snapshot.val() } as Room;
          set({ currentRoom: updatedRoom });
        }
      });
      
      // Generate bingo cards
      const cards = get().generateBingoCards(100);
      set({ bingoCards: cards });
    }
  },
  
  selectCard: (cardId: string) => {
    const { bingoCards } = get();
    const card = bingoCards.find(c => c.id === cardId);
    if (card && !card.claimed) {
      set({ selectedCard: card });
    }
  },
  
  placeBet: async () => {
    const { currentRoom, selectedCard } = get();
    if (!currentRoom || !selectedCard) return false;
    
    try {
      // Mark card as claimed
      const updatedCard = { ...selectedCard, claimed: true };
      const { bingoCards } = get();
      const updatedCards = bingoCards.map(c => 
        c.id === selectedCard.id ? updatedCard : c
      );
      
      set({ 
        bingoCards: updatedCards,
        selectedCard: updatedCard
      });
      
      return true;
    } catch (error) {
      console.error('Error placing bet:', error);
      return false;
    }
  },
  
  checkBingo: async () => {
    const { selectedCard, currentRoom } = get();
    if (!selectedCard || !currentRoom) return false;
    
    // Check for bingo patterns
    const { numbers } = selectedCard;
    const { calledNumbers } = currentRoom;
    
    // Check rows
    for (let row = 0; row < 5; row++) {
      if (numbers[row].every(num => calledNumbers.includes(num))) {
        return true;
      }
    }
    
    // Check columns
    for (let col = 0; col < 5; col++) {
      if (numbers.every(row => calledNumbers.includes(row[col]))) {
        return true;
      }
    }
    
    // Check diagonals
    const diagonal1 = [numbers[0][0], numbers[1][1], numbers[2][2], numbers[3][3], numbers[4][4]];
    const diagonal2 = [numbers[0][4], numbers[1][3], numbers[2][2], numbers[3][1], numbers[4][0]];
    
    if (diagonal1.every(num => calledNumbers.includes(num)) ||
        diagonal2.every(num => calledNumbers.includes(num))) {
      return true;
    }
    
    return false;
  },
  
  generateBingoCards: async (count: number) => {
  const cards: BingoCard[] = [];

  for (let i = 0; i < count; i++) {
    const card: BingoCard = {
      id: `card_${Date.now()}_${i + 1}`, // unique ID using timestamp
      serialNumber: i + 1,
      claimed: false,
      numbers: []
    };

    // Generate B column (1-15)
    const bNumbers = generateRandomNumbers(1, 15, 5);
    // Generate I column (16-30)
    const iNumbers = generateRandomNumbers(16, 30, 5);
    // Generate N column (31-45) with free space
    const nNumbers = generateRandomNumbers(31, 45, 4);
    // Generate G column (46-60)
    const gNumbers = generateRandomNumbers(46, 60, 5);
    // Generate O column (61-75)
    const oNumbers = generateRandomNumbers(61, 75, 5);

    // Arrange in rows
    for (let row = 0; row < 5; row++) {
      const cardRow = [
        bNumbers[row],
        iNumbers[row],
        row === 2 ? 0 : nNumbers[row > 2 ? row - 1 : row], // Free space in center
        gNumbers[row],
        oNumbers[row]
      ];
      card.numbers.push(cardRow);
    }

    cards.push(card);

    // Save each card to RTDB under "bingoCards/{card.id}"
    const cardRef = ref(rtdb, 'bingoCards/'+card.id);
    await fbset(cardRef, card); 
  }

  return cards;
}

}));

function generateRandomNumbers(min: number, max: number, count: number): number[] {
  const numbers = [];
  const available = [];
  
  for (let i = min; i <= max; i++) {
    available.push(i);
  }
  
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * available.length);
    numbers.push(available[randomIndex]);
    available.splice(randomIndex, 1);
  }
  
  return numbers;
}