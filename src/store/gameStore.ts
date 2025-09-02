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
  countdownStartedBy : string,
  calledNumbers: number[];
  winner?: string;
  payout?: number;
  countdown?: number; 
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
  const roomRef = ref(rtdb, "rooms/" + roomId);

  onValue(roomRef, (snapshot) => {
  if (!snapshot.exists()) {
    set({ currentRoom: null });
    return;
  }

  const updatedRoom = { id: roomId, ...snapshot.val() } as Room;
  set({ currentRoom: updatedRoom });

  // ✅ Always fetch cards
  get().fetchBingoCards();

  // ✅ Count how many players actually placed bets (claimed cards)
  const activePlayers = updatedRoom.players
    ? Object.values(updatedRoom.players).filter(
        (p: any) => p.betAmount && p.cardId
      )
    : [];

  const countdownRef = ref(rtdb, `rooms/${roomId}`);

  // ❌ Cancel stale countdown if <2 players
  if (
    activePlayers.length < 2 &&
    updatedRoom.gameStatus === "countdown" &&
    updatedRoom.countdown
  ) {
    (async () => {
      await update(countdownRef, {
        gameStatus: "waiting",
        countdown: null,
        countdownStartedBy: null,
      });
    })();
    return;
  }

  // ✅ Only start countdown if 2+ players are ACTIVE (have bet & card)
  //    AND no one has already locked ownership
  if (
    activePlayers.length >= 2 &&
    updatedRoom.gameStatus === "waiting" &&
    !updatedRoom.countdown &&
    !updatedRoom.countdownStartedBy
  ) {
    const { user } = useAuthStore.getState();
    if (!user?.telegramId) return;

    (async () => {
      // 🔒 Lock ownership
      await update(countdownRef, {
        gameStatus: "countdown",
        countdown: 30,
        countdownStartedBy: user.telegramId,
      });

      let sec = 30;

      const timer = setInterval(async () => {
        sec--;

        // 🔹 Re-check active players every tick
        const latestSnap = await get(roomRef);
        const latestRoom = latestSnap.val();

        // ⛔ Stop if another client took over (ownership changed)
        if (
          latestRoom?.countdownStartedBy &&
          latestRoom.countdownStartedBy !== user.telegramId
        ) {
          clearInterval(timer);
          return;
        }

        const stillActivePlayers = latestRoom?.players
          ? Object.values(latestRoom.players).filter(
              (p: any) => p.betAmount && p.cardId
            )
          : [];

        // ❌ Cancel countdown if fewer than 2 active players remain
        if (stillActivePlayers.length < 2) {
          clearInterval(timer);
          await update(countdownRef, {
            gameStatus: "waiting",
            countdown: null,
            countdownStartedBy: null,
          });
          return;
        }

        // ✅ Continue countdown
        if (sec > 0) {
          await update(countdownRef, { countdown: sec });
        } else {
          clearInterval(timer);
          await update(countdownRef, {
            gameStatus: "playing",
            countdown: null,
          });
        }
      }, 1000);
    })();
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

cancelBet: async (cardId?: string) => {
  const { selectedCard, currentRoom } = get();
  const { user } = useAuthStore.getState();

  if (!currentRoom || !user) return false;

  // Use passed cardId OR fallback to selectedCard.id
  const targetCardId = cardId || selectedCard?.id;
  if (!targetCardId) {
    console.error("❌ Cancel bet failed: no target card id");
    return false;
  }

  try {
    // ✅ Unclaim the card
    const cardRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards/${targetCardId}`);
    await update(cardRef, {
      claimed: false,
      claimedBy: null,
    });

    // ✅ Remove player entry from the room
    const playerRef = ref(rtdb, `rooms/${currentRoom.id}/players/${user.telegramId}`);
    await remove(playerRef);

    // ✅ Reset local state if this was the selected card
    if (selectedCard?.id === targetCardId) {
      set({ selectedCard: null });
    }

    console.log("✅ Bet canceled successfully");
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
        const { user } = useAuthStore.getState();
    if (user) {
      const userCard = cards.find(c => c.claimedBy === user.telegramId);
      set({ selectedCard: userCard || null });
    }
    });
  }

}));

