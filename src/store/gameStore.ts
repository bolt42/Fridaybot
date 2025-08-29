import { create } from 'zustand';
import { rtdb } from '../firebase/config';
import { ref, onValue, get, set as fbset , update } from 'firebase/database';
import { useAuthStore } from '../store/authStore';
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
  players?: { [id: string]: { id: string; username: string; betAmount: number; cardId: string } };
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
       get().fetchBingoCards();
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
  const { user } = useAuthStore.getState(); // ✅ logged-in user

  if (!currentRoom || !selectedCard || !user) return false;

  try {
    // ✅ Mark card as claimed locally
    const updatedCard = { ...selectedCard, claimed: true, claimedBy: user.id };
    set({
      selectedCard: updatedCard,
      bingoCards: get().bingoCards.map((c) =>
        c.id === updatedCard.id ? updatedCard : c
      ),
    });

    // ✅ Build bet object
    const betId = `${currentRoom.id}_${user.id}_${Date.now()}`;
    const betData = {
      betId,
      playerId: user.id,
      username: user.username,
      cardId: updatedCard.id,
      roomId: currentRoom.id,
      gameId: currentRoom.id, // 🔹 replace with actual gameId if separate
      betAmount: currentRoom.betAmount,
      timestamp: Date.now(),
    };

    // ✅ Save bet under room
    const betRef = ref(rtdb, `rooms/${currentRoom.id}/bets/${user.id}`);
    await fbset(betRef, betData);

    // ✅ Add player into room’s players list
    const playerRef = ref(rtdb, `rooms/${currentRoom.id}/players/${user.id}`);
    await fbset(playerRef, {
      id: user.id,
      username: user.username,
      betAmount: currentRoom.betAmount,
      cardId: updatedCard.id,
    });

    // ✅ (Optional) Central bets table
    const globalBetRef = ref(rtdb, `bets/${betId}`);
    await fbset(globalBetRef, betData);

    return true;
  } catch (error) {
    console.error("❌ Error recording bet:", error);
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
  generateBingoCards: (count: number) => {
  const cards: BingoCard[] = [];

  for (let i = 0; i < count; i++) {
    const card: BingoCard = {
      id: `card_${Date.now()}_${i + 1}`,
      serialNumber: i + 1,
      claimed: false,
      numbers: []
    };

    // build card...
    const bNumbers = generateRandomNumbers(1, 15, 5);
    const iNumbers = generateRandomNumbers(16, 30, 5);
    const nNumbers = generateRandomNumbers(31, 45, 4);
    const gNumbers = generateRandomNumbers(46, 60, 5);
    const oNumbers = generateRandomNumbers(61, 75, 5);

    for (let row = 0; row < 5; row++) {
      const cardRow = [
        bNumbers[row],
        iNumbers[row],
        row === 2 ? 0 : nNumbers[row > 2 ? row - 1 : row],
        gNumbers[row],
        oNumbers[row]
      ];
      card.numbers.push(cardRow);
    }

    cards.push(card);
  }

  // save all cards at once
  cards.forEach(async (card) => {
    const cardRef = ref(rtdb, 'bingoCards/' + card.id);
    await fbset(cardRef, card);
  });

  return cards;
},
fetchBingoCards: () => {
    const cardsRef = ref(rtdb, 'bingoCards');
    onValue(cardsRef, (snapshot) => {
      const data = snapshot.val();
      const cards: BingoCard[] = data
        ? Object.entries(data).map(([id, value]: [string, any]) => ({ id, ...value }))
        : [];
      set({ bingoCards: cards });
    });
  }

}));

