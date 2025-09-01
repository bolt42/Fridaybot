import { create } from 'zustand';
import { rtdb } from '../firebase/config';
import { ref, onValue, get, set as fbset , update , remove} from 'firebase/database';
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
  const roomRef = ref(rtdb, 'rooms/' + roomId);

  // Listen directly to this room
  onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      const updatedRoom = { id: roomId, ...snapshot.val() } as Room;
      set({ currentRoom: updatedRoom });

      // ✅ Also fetch cards once room is set
      get().fetchBingoCards();
    } else {
      set({ currentRoom: null });
    }
  });
},

joinRoom: (roomId: string) => {
  const roomRef = ref(rtdb, 'rooms/' + roomId);

  onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      const updatedRoom = { id: roomId, ...snapshot.val() } as Room;
      set({ currentRoom: updatedRoom });

      // ✅ Fetch cards once room is set
      get().fetchBingoCards();

      // ✅ Start countdown only when enough players & still waiting
      if (
        updatedRoom.players &&
        Object.keys(updatedRoom.players).length >= 2 &&
        updatedRoom.gameStatus === "waiting"
      ) {
        const countdownRef = ref(rtdb, `rooms/${roomId}`);
        update(countdownRef, { gameStatus: "countdown", countdown: 30 });

        let sec = 30;
        const timer = setInterval(async () => {
          sec--;
          await update(countdownRef, { countdown: sec });

          if (sec <= 0) {
            clearInterval(timer);
            await update(countdownRef, { gameStatus: "playing" });

            // ✅ Deduct balance when game actually starts
            const { players, betAmount } = updatedRoom;
            for (const pid in players) {
              const player = players[pid];
              const userBalanceRef = ref(rtdb, `users/${player.id}/balance`);
              get(userBalanceRef).then((snap) => {
                if (snap.exists()) {
                  const bal = snap.val() || 0;
                  update(userBalanceRef, bal - betAmount);
                }
              });
            }
          }
        }, 1000);
      }
    } else {
      set({ currentRoom: null });
    }
  });
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
  const { user } = useAuthStore.getState();
  if (!currentRoom || !selectedCard || !user) return false;

  const userId = user.telegramId;
  if (!userId) {
    console.error("❌ No valid telegramId for user:", user);
    return false;
  }

  if ((user.balance || 0) < currentRoom.betAmount) {
    alert("Insufficient balance!");
    return false;
  }

  try {
    // ✅ Mark card as claimed
    const cardRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards/${selectedCard.id}`);
    await update(cardRef, { claimed: true, claimedBy: userId });

    // ✅ Add player to room
    const playerRef = ref(rtdb, `rooms/${currentRoom.id}/players/${userId}`);
    await fbset(playerRef, {
      telegramId: userId,
      username: user.username,
      betAmount: currentRoom.betAmount,
      cardId: selectedCard.id,
    });

    return true;
  } catch (err) {
    console.error("❌ Error placing bet:", err);
    return false;
  }
},

cancelBet: async () => {
  const { selectedCard, currentRoom } = get();
  if (!selectedCard || !currentRoom) return false;

  if (!selectedCard?.id) {
    console.error("❌ Cancel bet failed: no selectedCard.id");
    return false;
  }

  try {
    // ✅ Unclaim the card only
    const cardRef = ref(
      rtdb,
      `rooms/${currentRoom.id}/bingoCards/${selectedCard.id}`
    );
    await update(cardRef, {
      claimed: false,
      claimedBy: null,
    });

    // ✅ Reset local state
    set({ selectedCard: null });

    console.log("✅ Card unclaimed successfully");
    return true;
  } catch (err) {
    console.error("❌ Cancel bet failed:", err);
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
      const { currentRoom } = get();
  if (!currentRoom) return;

    const cardsRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards`);
    onValue(cardsRef, (snapshot) => {
      const data = snapshot.val();
      const cards: BingoCard[] = data
        ? Object.entries(data).map(([id, value]: [string, any]) => ({ id, ...value }))
        : [];
      set({ bingoCards: cards });
    });
  }

}));

