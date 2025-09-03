import { create } from 'zustand';
import { rtdb } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import {
  ref,
  onValue,
  get as fbGet,
  set as fbSet,
  update,
  remove,
  push,
  runTransaction,
} from 'firebase/database';

// ----------------------
// Types
// ----------------------
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
  countdownStartedBy: string | null;
  calledNumbers: number[];
  winner?: string | null;
  payout?: number | null;
  countdownEndAt: number | null;
  players?: { [id: string]: { id: string; username: string; betAmount: number; cardId: string } };
  gameId?: string | null;
  nextGameCountdownEndAt?: number | null;
}

interface GamePayload {
  drawnNumbers: number[];
  startedAt: number;
  drawIntervalMs: number;
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
  claimBingo: () => Promise<boolean>;
  startNumberStream: (roomId: string, gameId: string) => void;
  startGameIfCountdownEnded: () => Promise<void>;
  fetchBingoCards: () => void;
}

// ----------------------
// Helpers
// ----------------------
function range(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

function mulberry32(a: number) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number) {
  const result = arr.slice();
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function checkCardHasBingo(numbers: number[][], calledNumbers: number[]) {
  for (let r = 0; r < 5; r++) if (numbers[r].every((n) => calledNumbers.includes(n))) return true;
  for (let c = 0; c < 5; c++) if (numbers.every((row) => calledNumbers.includes(row[c]))) return true;
  const diag1 = [numbers[0][0], numbers[1][1], numbers[2][2], numbers[3][3], numbers[4][4]];
  const diag2 = [numbers[0][4], numbers[1][3], numbers[2][2], numbers[3][1], numbers[4][0]];
  return diag1.every((n) => calledNumbers.includes(n)) || diag2.every((n) => calledNumbers.includes(n));
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

// ----------------------
// Store
// ----------------------
export const useGameStore = create<GameState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  selectedCard: null,
  bingoCards: [],
  loading: false,
  startingGame: false,
  displayedCalledNumbers: {},

  fetchRooms: () => {
    const roomsRef = ref(rtdb, 'rooms');
    onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      const rooms: Room[] = data
        ? Object.entries(data).map(([id, value]: [string, any]) => ({ id, ...(value as object) } as Room))
        : [];
      set({ rooms });
    });
  },

  joinRoom: (roomId: string) => {
    const roomRef = ref(rtdb, `rooms/${roomId}`);
    onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) return set({ currentRoom: null });
      const updatedRoom = { id: roomId, ...(snapshot.val() as any) } as Room;
      set({ currentRoom: updatedRoom });
      get().fetchBingoCards();

      const activePlayers = updatedRoom.players
        ? Object.values(updatedRoom.players).filter((p: any) => p.betAmount && p.cardId)
        : [];

      // auto-reset countdown if less than 2 players
      if (
        activePlayers.length < 2 &&
        updatedRoom.gameStatus === 'countdown' &&
        (updatedRoom.countdownEndAt || 0) > Date.now()
      ) {
        runTransaction(ref(rtdb, `rooms/${roomId}`), (room: any) => {
          if (!room) return;
          if (room.gameStatus === 'countdown') {
            room.gameStatus = 'waiting';
            room.countdownEndAt = null;
            room.countdownStartedBy = null;
          }
          return room;
        });
        return;
      }

      // start countdown if 2+ players and waiting
      if (
        activePlayers.length >= 2 &&
        updatedRoom.gameStatus === 'waiting' &&
        (!(updatedRoom.countdownEndAt || 0) || (updatedRoom.countdownEndAt || 0) < Date.now()) &&
        !updatedRoom.countdownStartedBy
      ) {
        const user = useAuthStore.getState().user;
        if (!user?.telegramId) return;
        const countdownEndAt = Date.now() + 30 * 1000;
        runTransaction(ref(rtdb, `rooms/${roomId}`), (room: any) => {
          if (!room) return;
          const playersObj = room.players || {};
          const activeCount = Object.values(playersObj).filter((p: any) => p.betAmount && p.cardId).length;
          if (activeCount >= 2 && room.gameStatus === 'waiting' && !room.countdownStartedBy) {
            room.gameStatus = 'countdown';
            room.countdownEndAt = countdownEndAt;
            room.countdownStartedBy = user.telegramId;
          }
          return room;
        });
      }

      // reset ended room to waiting if cooldown expired
     // inside joinRoom after you build updatedRoom:
if (
  updatedRoom.gameStatus === 'ended' &&
  updatedRoom.nextGameCountdownEndAt &&
  Date.now() >= updatedRoom.nextGameCountdownEndAt
) {
  runTransaction(ref(rtdb, `rooms/${roomId}`), (room: any) => {
    if (!room) return;
    if (room.gameStatus === 'ended') {
      room.gameStatus = 'waiting';
      room.nextGameCountdownEndAt = null;
    }
    return room;
  });
}

    });
  },

  selectCard: (cardId: string) => {
    const card = get().bingoCards.find((c) => c.id === cardId);
    if (card && !card.claimed) set({ selectedCard: card });
  },

  placeBet: async () => {
    const { currentRoom, selectedCard } = get();
    const { user } = useAuthStore.getState();
    if (!currentRoom || !selectedCard || !user) return false;

    const userId = user.telegramId;
    if (!userId || (user.balance || 0) < currentRoom.betAmount) return false;

    try {
      const cardRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards/${selectedCard.id}`);
      const result = await runTransaction(cardRef, (card: any) => {
        if (!card || card.claimed) return;
        card.claimed = true;
        card.claimedBy = userId;
        return card;
      });
      if (!result.committed) return false;

      const playerRef = ref(rtdb, `rooms/${currentRoom.id}/players/${userId}`);
      await fbSet(playerRef, {
        telegramId: userId,
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
      await update(ref(rtdb, `rooms/${currentRoom.id}/bingoCards/${targetCardId}`), { claimed: false, claimedBy: null });
      await remove(ref(rtdb, `rooms/${currentRoom.id}/players/${user.telegramId}`));
      if (selectedCard?.id === targetCardId) set({ selectedCard: null });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  startGameIfCountdownEnded: async () => {
    const { currentRoom, startingGame } = get();
    if (!currentRoom || startingGame) return;
    if (currentRoom.gameStatus !== 'countdown' || !(currentRoom.countdownEndAt || 0)) return;
    if (Date.now() < (currentRoom.countdownEndAt || 0)) return;

    set({ startingGame: true });

    try {
      const roomRef = ref(rtdb, `rooms/${currentRoom.id}`);
      await runTransaction(roomRef, (room: any) => {
        if (!room) return;
        if (room.gameStatus === 'countdown' && (room.countdownEndAt || 0) <= Date.now() && !room.gameId) {
          room.gameStatus = 'playing';
          room.gameId = 'pending';
        }
        return room;
      });

      const roomSnap = await fbGet(roomRef);
      const roomVal = roomSnap.val();
      if (!roomVal || roomVal.gameStatus !== 'playing' || roomVal.gameId !== 'pending') return;

      const gamesRefRoot = ref(rtdb, 'games');
      const newGameRef = push(gamesRefRoot);
      const gameId = newGameRef.key as string;

      const seed = (hashCode(currentRoom.id) ^ (currentRoom.countdownEndAt || 0)) >>> 0;
      const allNumbers = seededShuffle(range(75), seed);
      const numbers = allNumbers.slice(0, 25); // only first 25 drawn numbers
      const payload: GamePayload = { drawnNumbers: numbers, startedAt: Date.now(), drawIntervalMs: 3000 };

      await fbSet(ref(rtdb, `games/${gameId}`), payload);
      await update(roomRef, {
        gameId,
        gameStatus: 'playing',
        countdownEndAt: null,
        countdownStartedBy: null,
        calledNumbers: [],
      });
    } catch (err) {
      console.error(err);
    } finally {
      set({ startingGame: false });
    }
  },

  startNumberStream: (roomId: string, gameId: string) => {
    if (!gameId) return;
    const gameRef = ref(rtdb, `games/${gameId}`);

    onValue(gameRef, (snapshot) => {
      const data = snapshot.val() as GamePayload | null;
      if (!data || !data.drawnNumbers || !data.startedAt) return;

      const { drawnNumbers, startedAt, drawIntervalMs } = data;
      const elapsed = Date.now() - startedAt;
      let index = Math.floor(elapsed / drawIntervalMs);
      if (index > drawnNumbers.length) index = drawnNumbers.length;

      set((state) => ({
        displayedCalledNumbers: { ...state.displayedCalledNumbers, [roomId]: drawnNumbers.slice(0, index) },
      }));

      let i = index;
      const interval = setInterval(() => {
        if (i >= drawnNumbers.length) {
          clearInterval(interval);
          (async () => {
            try {
              await runTransaction(ref(rtdb, `rooms/${roomId}`), (room: any) => {
                if (!room) return;
                if (room.gameStatus === 'playing') {
                  room.gameStatus = 'ended';
                  room.gameId = null;
                  room.calledNumbers = [];
                  room.countdownEndAt = null;
                  room.countdownStartedBy = null;
                  room.nextGameCountdownEndAt = Date.now() + 60 * 1000;
                }
                return room;
              });
            } catch (err) {
              console.error(err);
            }
          })();
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

  claimBingo: async () => {
    const { currentRoom, selectedCard } = get();
    const { user } = useAuthStore.getState();
    if (!currentRoom || !selectedCard || !user) return false;
    if (!currentRoom.gameId) return false;

    try {
      const gameSnap = await fbGet(ref(rtdb, `games/${currentRoom.gameId}`));
      const game: GamePayload | null = gameSnap.val();
      if (!game) return false;

      const elapsed = Date.now() - game.startedAt;
      const index = Math.min(Math.floor(elapsed / game.drawIntervalMs), game.drawnNumbers.length);
      const called = game.drawnNumbers.slice(0, index);

      if (!checkCardHasBingo(selectedCard.numbers, called)) return false;

      const roomRef = ref(rtdb, `rooms/${currentRoom.id}`);
      const res = await runTransaction(roomRef, (room: any) => {
        if (!room || room.winner || room.gameStatus !== 'playing') return;
        room.winner = user.telegramId;
        room.payout = (room.betAmount || 0) * (Object.keys(room.players || {}).length || 1);
        room.gameStatus = 'ended';
        room.gameId = null;
        room.nextGameCountdownEndAt = Date.now() + 30 * 1000;
        return room;
      });

      return Boolean(res.committed);
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  fetchBingoCards: () => {
    const { currentRoom } = get();
    if (!currentRoom) return;

    const cardsRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards`);
    onValue(cardsRef, (snapshot) => {
      const data = snapshot.val();
      const cards: BingoCard[] = data
        ? Object.entries(data).map(([id, value]: [string, any]) => ({ id, ...(value as object) } as BingoCard))
        : [];
      set({ bingoCards: cards });
    });
  },
}));
