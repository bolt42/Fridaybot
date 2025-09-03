import { create } from "zustand";
import { rtdb } from "../bot/firebaseConfig.js";
import { ref, onValue, update, remove, runTransaction, set as fbset } from "firebase/database";
import { useAuthStore } from "./authStore";

export interface BingoCard {
  id: string;
  numbers: number[][];
  serialNumber: number;
  claimed: boolean;
  claimedBy?: string;
  roomId?: string;
}

export interface Room {
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

export interface GameState {
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
  startGameIfCountdownEnded: () => void;
  endGame: (roomId: string) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  rooms: [],
  displayedCalledNumbers: {},
  currentRoom: null,
  selectedCard: null,
  bingoCards: [],
  loading: false,
  startingGame: false,

  fetchRooms: () => {
    const roomsRef = ref(rtdb, "rooms");
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
    onValue(roomRef, async (snapshot) => {
      if (!snapshot.exists()) {
        set({ currentRoom: null });
        return;
      }

      const updatedRoom = { id: roomId, ...snapshot.val() } as Room;
      set({ currentRoom: updatedRoom });

      get().fetchBingoCards();

      const activePlayers = updatedRoom.players
        ? Object.values(updatedRoom.players).filter((p: any) => p.betAmount && p.cardId)
        : [];

      // Cancel countdown if <2 players
      if (
        activePlayers.length < 2 &&
        updatedRoom.gameStatus === "countdown" &&
        updatedRoom.countdownEndAt > Date.now()
      ) {
        await update(roomRef, {
          gameStatus: "waiting",
          countdownEndAt: null,
          countdownStartedBy: null,
        });
        return;
      }

      // Start countdown if 2+ active players
      if (
        activePlayers.length >= 2 &&
        updatedRoom.gameStatus === "waiting" &&
        (!updatedRoom.countdownEndAt || updatedRoom.countdownEndAt < Date.now()) &&
        !updatedRoom.countdownStartedBy
      ) {
        const { user } = useAuthStore.getState();
        if (!user?.telegramId) return;

        const countdownDuration = 30 * 1000;
        const countdownEndAt = Date.now() + countdownDuration;

        await runTransaction(roomRef, (room) => {
          if (!room || room.gameStatus !== "waiting") return room;
          room.gameStatus = "countdown";
          room.countdownEndAt = countdownEndAt;
          room.countdownStartedBy = user.telegramId;
          return room;
        });
      }

      // Reset ended game if cooldown expired
      if (updatedRoom.gameStatus === "ended" && updatedRoom.nextGameCountdownEndAt && updatedRoom.nextGameCountdownEndAt <= Date.now()) {
        await update(roomRef, { gameStatus: "waiting", nextGameCountdownEndAt: null });
      }
    });
  },

  selectCard: (cardId: string) => {
    const card = get().bingoCards.find((c) => c.id === cardId && !c.claimed);
    if (card) set({ selectedCard: card });
  },

  placeBet: async () => {
    const { currentRoom, selectedCard } = get();
    const { user } = useAuthStore.getState();
    if (!currentRoom || !selectedCard || !user) return false;

    if ((user.balance || 0) < currentRoom.betAmount) {
      alert("Insufficient balance!");
      return false;
    }

    try {
      const cardRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards/${selectedCard.id}`);
      const result = await runTransaction(cardRef, (card: any) => {
        if (!card || card.claimed) return;
        card.claimed = true;
        card.claimedBy = user.telegramId;
        return card;
      });

      if (!result.committed) {
        alert("❌ This card was already claimed!");
        return false;
      }

      const playerRef = ref(rtdb, `rooms/${currentRoom.id}/players/${user.telegramId}`);
      await fbset(playerRef, {
        telegramId: user.telegramId,
        username: user.username,
        betAmount: currentRoom.betAmount,
        cardId: selectedCard.id,
      });

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  cancelBet: async (cardId?: string) => {
    const { currentRoom, selectedCard } = get();
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
      console.error(err);
      return false;
    }
  },

  checkBingo: async () => {
    const { selectedCard, currentRoom } = get();
    if (!selectedCard || !currentRoom) return false;

    const { numbers } = selectedCard;
    const { calledNumbers } = currentRoom;

    // Rows
    for (let r = 0; r < 5; r++) if (numbers[r].every((n) => calledNumbers.includes(n))) return true;
    // Columns
    for (let c = 0; c < 5; c++) if (numbers.every((r) => calledNumbers.includes(r[c]))) return true;
    // Diagonals
    const diag1 = [0, 1, 2, 3, 4].map((i) => numbers[i][i]);
    const diag2 = [0, 1, 2, 3, 4].map((i) => numbers[i][4 - i]);
    if (diag1.every((n) => calledNumbers.includes(n)) || diag2.every((n) => calledNumbers.includes(n))) return true;

    return false;
  },

  fetchBingoCards: () => {
    const { currentRoom } = get();
    if (!currentRoom) return;

    const cardsRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards`);
    onValue(cardsRef, (snapshot) => {
      const data = snapshot.val();
      const cards: BingoCard[] = data ? Object.entries(data).map(([id, v]: [string, any]) => ({ id, ...v })) : [];
      set({ bingoCards: cards });

      const { user } = useAuthStore.getState();
      const { selectedCard } = get();
      if (user) {
        const userCard = cards.find((c) => c.claimedBy === user.telegramId);
        if (userCard && (!selectedCard || selectedCard.id !== userCard.id)) set({ selectedCard: userCard });
        else if (!userCard && !selectedCard) set({ selectedCard: null });
      }
    });
  },

  startGameIfCountdownEnded: async () => {
    const { currentRoom, startingGame } = get();
    if (!currentRoom || startingGame) return;
    if (currentRoom.gameStatus !== "countdown" || !currentRoom.countdownEndAt) return;
    if (Date.now() < currentRoom.countdownEndAt) return;

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
    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const cooldownDuration = 60 * 1000;
    const nextGameCountdownEndAt = Date.now() + cooldownDuration;

    try {
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
          console.error(err);
        }
      }, cooldownDuration);
    } catch (err) {
      console.error(err);
    }
  },
}));
