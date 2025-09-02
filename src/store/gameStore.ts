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

  // Create 5 buckets (B-I-N-G-O)
  const ranges = [
    Array.from({ length: 15 }, (_, i) => i + 1),   // 1–15
    Array.from({ length: 15 }, (_, i) => i + 16),  // 16–30
    Array.from({ length: 15 }, (_, i) => i + 31),  // 31–45
    Array.from({ length: 15 }, (_, i) => i + 46),  // 46–60
    Array.from({ length: 15 }, (_, i) => i + 61),  // 61–75
  ];

  let bucketIndex = 0; // start with B column
  let drawn: number[] = [];

  const interval = setInterval(async () => {
    // stop if we exhausted all buckets
    if (bucketIndex >= ranges.length) {
      clearInterval(interval);

      // ✅ Reset room when game ends
      await update(roomRef, {
        gameStatus: "ended",
        gameId: null,              // clear game reference
        countdownEndAt: null,      // reset countdown
        countdownStartedBy: null,  // reset who started it
      });

      return;
    }

    const bucket = ranges[bucketIndex];
    if (bucket.length === 0) {
      bucketIndex++; // move to next column
      return;
    }

    // draw one random number from current bucket
    const idx = Math.floor(Math.random() * bucket.length);
    const num = bucket[idx];
    bucket.splice(idx, 1); // remove from bucket
    drawn.push(num);

    // ✅ append new drawn number
    await update(gameRef, { drawnNumbers: drawn });
    await update(roomRef, {
      calledNumbers: drawn,
      lastCalledNumber: num, // keep track of latest
    });

    // after 5 numbers, move to next bucket
    if (
      drawn.filter((n) => {
        if (bucketIndex === 0) return n <= 15;
        if (bucketIndex === 1) return n >= 16 && n <= 30;
        if (bucketIndex === 2) return n >= 31 && n <= 45;
        if (bucketIndex === 3) return n >= 46 && n <= 60;
        if (bucketIndex === 4) return n >= 61 && n <= 75;
        return false;
      }).length >= 5
    ) {
      bucketIndex++;
    }
  }, 4000); // every 4s
},

startGameIfCountdownEnded: async () => {
  const { currentRoom, bingoCards } = get();
  if (!currentRoom) return;

  // Only proceed if countdown is over
  if (currentRoom.gameStatus !== "countdown" || !currentRoom.countdownEndAt) return;
  if (Date.now() < currentRoom.countdownEndAt) return;

  const roomRef = ref(rtdb, `rooms/${currentRoom.id}`);
  const gamesRef = ref(rtdb, "games");

  // ✅ Transaction: claim game slot
  const txResult = await runTransaction(roomRef, (room: any) => {
    if (!room) return room;

    // if already playing or has a game, abort
    if (room.gameId || room.gameStatus === "playing") {
      return room;
    }

    // mark as playing & reserve a gameId
    const newGameRef = push(gamesRef);
    const gameId = newGameRef.key;
    room.gameId = gameId;
    room.gameStatus = "playing";
    room.countdownStartedBy = null;
    room.countdownEndAt = null;

    // attach temporary gameId so only one client creates game
    room.__pendingGameId = gameId;
    return room;
  });

  if (!txResult.committed || !txResult.snapshot.exists()) {
    console.log("⚠️ Another client already started the game.");
    return;
  }

  const room = txResult.snapshot.val();
  const gameId = room.__pendingGameId;

  // ✅ collect claimed cards
  const activeCards = bingoCards.filter((c) => c.claimed);
  const totalAmount = activeCards.length * currentRoom.betAmount * 0.9;

  // ✅ create game data
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

  // ✅ commit game object
  await update(ref(rtdb), {
    [`games/${gameId}`]: gameData,
    [`rooms/${currentRoom.id}/__pendingGameId`]: null, // cleanup temp
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
  }

}));

