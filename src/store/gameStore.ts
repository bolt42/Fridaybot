import { create } from 'zustand';
import { rtdb } from '../firebase/config';
import { ref, onValue, get, set as fbset, update, remove, push, runTransaction } from 'firebase/database';
import { useAuthStore } from '../store/authStore';
interface BingoCard {
  id: string;
  numbers: number[][];
  serialNumber: number;
  claimed: boolean;
  claimedBy?: string;
  roomId?: string;
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
  countdownStartedBy: string;
  calledNumbers: number[];
  winner?: string;
  payout?: number;
  countdownEndAt: number;
  players?: { [id: string]: { id: string; username: string; betAmount: number; cardId: string } };
  gameId?: string;
  nextGameCountdownEndAt?: number;
}

interface GameState {
  rooms: Room[];
  currentRoom: Room | null;
  selectedCard: BingoCard | null;
  bingoCards: BingoCard[];
  loading: boolean;
  startingGame: boolean;
  displayedCalledNumbers: { [roomId: string]: number[] };
  fetchRooms: () => void;
  joinRoom: (roomId: string) => void;
  selectCard: (cardId: string) => void;
  placeBet: () => Promise<boolean>;
  cancelBet: (cardId?: string) => Promise<boolean>;
  checkBingo: () => Promise<boolean>;
  fetchBingoCards: () => void;
  startNumberStream: (roomId: string, gameId: string) => void;
  endGame: (roomId: string) => void;
  startGameIfCountdownEnded: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  rooms: [],
  displayedCalledNumbers: [],
  currentRoom: null,
  selectedCard: null,
  bingoCards: [],
  loading: false,
  startingGame: false,

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
    const roomRef = ref(rtdb, `rooms/${roomId}`);

    onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        set({ currentRoom: null });
        return;
      }

      const updatedRoom = { id: roomId, ...snapshot.val() } as Room;
      set({ currentRoom: updatedRoom });

      // Always fetch cards
      get().fetchBingoCards();
    });
  },

  selectCard: (cardId: string) => {
    const { bingoCards } = get();
    const card = bingoCards.find(c => c.id === cardId);
    if (card && !card.claimed) set({ selectedCard: card });
  },

  placeBet: async () => {
    const { currentRoom, selectedCard } = get();
    const { user } = useAuthStore.getState();
    if (!currentRoom || !selectedCard || !user) return false;

    const userId = user.telegramId;
    if (!userId) return false;

    if ((user.balance || 0) < currentRoom.betAmount) {
      alert("Insufficient balance!");
      return false;
    }

    try {
      const cardRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards/${selectedCard.id}`);
      const result = await runTransaction(cardRef, (card: any) => {
        if (card) {
          if (card.claimed) return;
          card.claimed = true;
          card.claimedBy = userId;
        }
        return card;
      });

      if (!result.committed) {
        alert("❌ This card was already claimed by another player!");
        return false;
      }

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

    const targetCardId = cardId || selectedCard?.id;
    if (!targetCardId) return false;

    try {
      const cardRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards/${targetCardId}`);
      await update(cardRef, { claimed: false, claimedBy: null });

      const playerRef = ref(rtdb, `rooms/${currentRoom.id}/players/${user.telegramId}`);
      await remove(playerRef);

      if (selectedCard?.id === targetCardId) set({ selectedCard: null });

      return true;
    } catch (err) {
      console.error("❌ Cancel bet failed:", err);
      return false;
    }
  },

  checkBingo: async () => {
    const { selectedCard, currentRoom } = get();
    if (!selectedCard || !currentRoom) return false;

    const { numbers } = selectedCard;
    const { calledNumbers } = currentRoom;

    for (let row = 0; row < 5; row++) {
      if (numbers[row].every(num => calledNumbers.includes(num))) return true;
    }

    for (let col = 0; col < 5; col++) {
      if (numbers.every(row => calledNumbers.includes(row[col]))) return true;
    }

    const diagonal1 = [numbers[0][0], numbers[1][1], numbers[2][2], numbers[3][3], numbers[4][4]];
    const diagonal2 = [numbers[0][4], numbers[1][3], numbers[2][2], numbers[3][1], numbers[4][0]];

    if (diagonal1.every(num => calledNumbers.includes(num)) ||
        diagonal2.every(num => calledNumbers.includes(num))) return true;

    return false;
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
        if (userCard && (!selectedCard || selectedCard.id !== userCard.id)) {
          set({ selectedCard: userCard });
        } else if (!userCard && !selectedCard) {
          set({ selectedCard: null });
        }
      }
    });
  },

  startNumberStream: (roomId, gameId) => {
    const gameRef = ref(rtdb, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (!data || !data.drawnNumbers || !data.startedAt) return;

      const { drawnNumbers, startedAt, drawIntervalMs } = data;
      const elapsed = Date.now() - startedAt;
      let currentIndex = Math.floor(elapsed / drawIntervalMs);
      if (currentIndex > drawnNumbers.length) currentIndex = drawnNumbers.length;

      set((state) => ({
        displayedCalledNumbers: {
          ...state.displayedCalledNumbers,
          [roomId]: drawnNumbers.slice(0, currentIndex),
        },
      }));

      let i = currentIndex;
      const interval = setInterval(() => {
        if (i >= drawnNumbers.length) {
          clearInterval(interval);
          get().endGame(roomId);
          return;
        }

        set((state) => ({
          displayedCalledNumbers: {
            ...state.displayedCalledNumbers,
            [roomId]: [...(state.displayedCalledNumbers[roomId] || []), drawnNumbers[i]],
          },
        }));
        i++;
      }, drawIntervalMs);
    });
  },

  endGame: async (roomId: string) => {
    try {
      const roomRef = ref(rtdb, `rooms/${roomId}`);
      const cooldownDuration = 1 * 60 * 1000; // 1 min cooldown
      const nextGameCountdownEndAt = Date.now() + cooldownDuration;

      await update(roomRef, {
        gameStatus: "ended",
        gameId: null,
        calledNumbers: [],
        countdownEndAt: null,
        countdownStartedBy: null,
        nextGameCountdownEndAt,
      });

      setTimeout(async () => {
        try {
          await update(roomRef, { gameStatus: "waiting", nextGameCountdownEndAt: null });
        } catch (err) {
          console.error("❌ Failed to reset room after cooldown:", err);
        }
      }, cooldownDuration);

    } catch (err) {
      console.error("❌ Failed to end game:", err);
    }
  },

  startGameIfCountdownEnded: async () => {
    const { currentRoom, startingGame } = get();
    if (!currentRoom || startingGame) return;

    set({ startingGame: true });

    try {
      const res = await fetch("/api/start-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: currentRoom.id }),
      });

      const data = await res.json();
      console.log("✅ Game started:", data);
    } catch (err) {
      console.error("❌ Failed to start game:", err);
    } finally {
      set({ startingGame: false });
    }
  },
}));
