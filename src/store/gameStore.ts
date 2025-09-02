import { create } from 'zustand';
import { rtdb } from '../firebase/config';
import { ref, onValue, get, set as fbset , update , remove, push} from 'firebase/database';
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
  countdownEndAt: number, 
  players?: { [id: string]: { id: string; username: string; betAmount: number; cardId: string } };
  gameId?: string;
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
 // add this
drawNumbersLoop: () => {
  const { currentRoom } = get();
  if (!currentRoom || currentRoom.gameStatus !== "playing") return;

  const gameRef = ref(rtdb, `games/${currentRoom.gameId}`);
  const roomRef = ref(rtdb, `rooms/${currentRoom.id}`);

  let availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
  let drawn: number[] = [];

  let count = 0;
  const interval = setInterval(async () => {
    if (count >= 25 || availableNumbers.length === 0) {
      clearInterval(interval);
      // game ends automatically after 25 draws
      await update(roomRef, { gameStatus: "ended" });
      const cardsRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards`);
      const snapshot = await get(cardsRef);
  if (snapshot.exists()) {
    const updates: any = {};
    snapshot.forEach((cardSnap) => {
      const cardId = cardSnap.key;
      updates[cardId + "/claimed"] = false;
      updates[cardId + "/claimedBy"] = null;
    });
    await update(cardsRef, updates);
  }

      return;
    }

    // pick a random number
    const idx = Math.floor(Math.random() * availableNumbers.length);
    const num = availableNumbers[idx];
    availableNumbers.splice(idx, 1);
    drawn.push(num);

    // push to firebase
    await update(gameRef, { drawnNumbers: drawn });
    await update(roomRef, { calledNumbers: drawn });

    count++;
  }, 4000); // every 4s
},
// inside useGameStore
startGameIfCountdownEnded: async () => {
  const { currentRoom, bingoCards } = get();
  if (!currentRoom) return;

  // Countdown not yet over
  if (currentRoom.gameStatus !== "countdown" || !currentRoom.countdownEndAt) return;
  if (Date.now() < currentRoom.countdownEndAt) return;

  const roomRef = ref(rtdb, `rooms/${currentRoom.id}`);
  const gamesRef = ref(rtdb, `games`);

  // ✅ collect claimed cards
  const activeCards = bingoCards.filter(c => c.claimed);

  // ✅ total payout
  const totalAmount = activeCards.length * currentRoom.betAmount * 0.9;

  // ✅ create new game
  const newGameRef = push(gamesRef);
  const gameId = newGameRef.key;

  const gameData = {
    id: gameId,
    roomId: currentRoom.id,
    bingoCards: activeCards,
    winners: [],
    drawnNumbers: [],
    createdAt: Date.now(),
    status: "playing",
    amount: totalAmount,
  };

  // write both room + game atomically
await update(ref(rtdb), {
  [`rooms/${currentRoom.id}/gameStatus`]: "playing",
  [`rooms/${currentRoom.id}/gameId`]: gameId,
  [`rooms/${currentRoom.id}/countdownStartedBy`]: null,
  [`rooms/${currentRoom.id}/countdownEndAt`]: null,
  [`games/${gameId}`]: gameData,
});

// ✅ start number drawing process
get().drawNumbersLoop();

  console.log("✅ Game started:", gameData);
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

