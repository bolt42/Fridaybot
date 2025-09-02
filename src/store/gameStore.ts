import { create } from 'zustand';
import { rtdb } from '../firebase/config';
import { ref, onValue, get, set as fbset , update , remove, push, runTransaction} from 'firebase/database';
import { useAuthStore } from '../store/authStore';
interface BingoCard {
  id: string;
  numbers: number[][];
  serialNumber: number;
  claimed: boolean;
  claimedBy?: string;
  roomId?: string; // ✅ Add roomId property
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
  countdownEndAt: number, 
  players?: { [id: string]: { id: string; username: string; betAmount: number; cardId: string } };
  gameId?: string;
  gameEndedAt?: number; // ✅ When the game ended
  nextGameCountdown?: number; // ✅ When next game countdown starts
  lastCalledNumber?: number; // ✅ Last called number
}
interface GameState {
  rooms: Room[];
  currentRoom: Room | null;
  selectedCard: BingoCard | null;
  bingoCards: BingoCard[];
  loading: boolean;
  startingGame: boolean; // ✅ Prevent multiple simultaneous start game calls
  fetchRooms: () => void;
  joinRoom: (roomId: string) => void;
  selectCard: (cardId: string) => void;
  placeBet: () => Promise<boolean>;
  checkBingo: () => Promise<boolean>;
  generateBingoCards: (count: number) => BingoCard[];
  stopGame: (roomId: string) => Promise<boolean>; // ✅ Add stop game function
  cancelBet: (cardId?: string) => Promise<boolean>; // ✅ Add cancel bet function
  startGameIfCountdownEnded: () => Promise<void>; // ✅ Add start game function
  checkRoomReset: () => void; // ✅ Add room reset check function
}

export const useGameStore = create<GameState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  selectedCard: null,
  bingoCards: [],
  loading: false,
  startingGame: false, // ✅ Initialize startingGame flag
 // add this

startGameIfCountdownEnded: async () => {
  const { currentRoom, startingGame } = get();
  if (!currentRoom) return;

  // ✅ Prevent multiple simultaneous calls
  if (startingGame) {
    console.log("⚠️ Game start already in progress, skipping...");
    return;
  }

  if (currentRoom.gameStatus !== "countdown" || !currentRoom.countdownEndAt) return;
  if (Date.now() < currentRoom.countdownEndAt) return;

  // ✅ Set flag to prevent multiple calls
  set({ startingGame: true });

  try {
    const res =await fetch("/api/start-game", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ roomId: currentRoom.id }),
});

    let data;
    try {
      data = await res.json();
    } catch {
      const text = await res.text();
      throw new Error(`Server did not return JSON: ${text}`);
    }

    if (!res.ok) {
      console.error("❌ Failed to start game:", data.error);
      return;
    }

    console.log("✅ Game created on server:", data.gameId);
    // ❌ remove drawNumbersLoop
    // server now runs the loop
  } catch (err) {
    console.error("❌ Error calling start-game API:", err);
  } finally {
    // ✅ Always reset the flag
    set({ startingGame: false });
  }
},

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
  get().startGameIfCountdownEnded();
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
  updatedRoom.countdownEndAt > Date.now()
) {
  (async () => {
    await update(countdownRef, {
      gameStatus: "waiting",
      countdownEndAt: null,
      countdownStartedBy: null,
    });
  })();
  return;
}

// ✅ Start countdown if 2+ active players, room waiting, and no countdown in progress
if (
  activePlayers.length >= 2 &&
  updatedRoom.gameStatus === "waiting" &&
  (!updatedRoom.countdownEndAt || updatedRoom.countdownEndAt < Date.now()) &&
  !updatedRoom.countdownStartedBy
) {
  const { user } = useAuthStore.getState();
  if (!user?.telegramId) return;

  const countdownDuration = 30 * 1000; // 30s
  const countdownEndAt = Date.now() + countdownDuration;

  update(countdownRef, {
    gameStatus: "countdown",
    countdownEndAt,
    countdownStartedBy: user.telegramId,
  });
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
    const cardRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards/${selectedCard.id}`);

    // 🔒 Transaction ensures atomic update
    const result = await runTransaction(cardRef, (card: any) => {
      if (card) {
        if (card.claimed) {
          // ❌ Already taken
          return; 
        }
        // ✅ Mark card as claimed
        card.claimed = true;
        card.claimedBy = userId;
      }
      return card;
    });

    if (!result.committed) {
      alert("❌ This card was already claimed by another player!");
      return false;
    }

    // ✅ Add player to room if card claim succeeded
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
const { selectedCard } = get();

if (user) {
  const userCard = cards.find(c => c.claimedBy === user.telegramId);

  // ✅ Only set if user has a claimed card OR nothing is selected yet
  if (userCard && (!selectedCard || selectedCard.id !== userCard.id)) {
    set({ selectedCard: userCard });
  } else if (!userCard && !selectedCard) {
    set({ selectedCard: null });
  }
}

    });
  },

  // ✅ Stop game function
  stopGame: async (roomId: string) => {
    try {
      const res = await fetch("/api/start-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, action: "stop" }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        console.error("❌ Failed to stop game:", data.error);
        return false;
      }

      console.log("✅ Game stopped successfully:", data.message);
      return true;
    } catch (err) {
      console.error("❌ Error stopping game:", err);
      return false;
    }
  },

  // ✅ Check if room should be reset after countdown
  checkRoomReset: () => {
    const { currentRoom } = get();
    if (!currentRoom?.nextGameCountdown) return;

    const now = Date.now();
    if (now >= currentRoom.nextGameCountdown) {
      // Room should be reset, but this will be handled by the server
      console.log("⏰ Room countdown ended, waiting for server reset...");
    }
  }

}));

