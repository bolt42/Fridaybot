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
// Types (same as yours)
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
  fetchRooms: () => void;
  joinRoom: (roomId: string) => void;
  selectCard: (cardId: string) => void;
  placeBet: () => Promise<boolean>;
  cancelBet: (cardId?: string) => Promise<boolean>;
  claimBingo: () => Promise<boolean>;
  displayedCalledNumbers: { [roomId: string]: number[] };
  startNumberStream: (roomId: string, gameId: string) => void;
}

// ----------------------
// Helpers
// ----------------------
function range(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

// deterministic RNG (mulberry32) so that one client can generate same sequence
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

  // ----------------------
  // Fetch rooms (listener)
  // ----------------------
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

  // ----------------------
  // Join a room (listen to room + ensure client reacts only)
  // ----------------------
  joinRoom: (roomId: string) => {
    const roomRef = ref(rtdb, `rooms/${roomId}`);

    onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        set({ currentRoom: null });
        return;
      }

      const updatedRoom = { id: roomId, ...(snapshot.val() as any) } as Room;
      set({ currentRoom: updatedRoom });

      // Always fetch cards for the joined room
      get().fetchBingoCards();

      // Auto-cancel stale countdowns (if below 2 active players)
      const activePlayers = updatedRoom.players
        ? Object.values(updatedRoom.players).filter((p: any) => p.betAmount && p.cardId)
        : [];

      if (
        activePlayers.length < 2 &&
        updatedRoom.gameStatus === 'countdown' &&
        (updatedRoom.countdownEndAt || 0) > Date.now()
      ) {
        // Use a transaction to safely revert the countdown only when still in countdown
        runTransaction(ref(rtdb, `rooms/${roomId}`), (room: any) => {
          if (!room) return;
          if (room.gameStatus === 'countdown' && (room.countdownEndAt || 0) > Date.now()) {
            room.gameStatus = 'waiting';
            room.countdownEndAt = null;
            room.countdownStartedBy = null;
          }
          return room;
        });
        return;
      }

      // If we have 2+ active players and room is waiting -> try to start countdown using transaction
      if (
        activePlayers.length >= 2 &&
        updatedRoom.gameStatus === 'waiting' &&
        (!(updatedRoom.countdownEndAt || 0) || (updatedRoom.countdownEndAt || 0) < Date.now()) &&
        !updatedRoom.countdownStartedBy
      ) {
        const user = useAuthStore.getState().user;
        if (!user?.telegramId) return;

        const countdownDuration = 30 * 1000; // 30s
        const countdownEndAt = Date.now() + countdownDuration;

        // Transaction ensures only one client sets the countdown
        runTransaction(ref(rtdb, `rooms/${roomId}`), (room: any) => {
          if (!room) return;
          // double-check conditions
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

      // If ended and cooldown expired, reset to waiting using transaction
      if (
        updatedRoom.gameStatus === 'ended' &&
        (updatedRoom.nextGameCountdownEndAt || 0) <= Date.now() &&
        (updatedRoom.nextGameCountdownEndAt || 0) > 0
      ) {
        runTransaction(ref(rtdb, `rooms/${roomId}`), (room: any) => {
          if (!room) return;
          if (room.gameStatus === 'ended' && (room.nextGameCountdownEndAt || 0) <= Date.now()) {
            room.gameStatus = 'waiting';
            room.nextGameCountdownEndAt = null;
          }
          return room;
        });
      }
    });
  },

  // ----------------------
  // Select a card locally (UI only)
  // ----------------------
  selectCard: (cardId: string) => {
    const card = get().bingoCards.find((c) => c.id === cardId);
    if (card && !card.claimed) set({ selectedCard: card });
  },

  // ----------------------
  // Place bet (atomic claim card + add player)
  // ----------------------
  placeBet: async () => {
    const { currentRoom, selectedCard } = get();
    const { user } = useAuthStore.getState();
    if (!currentRoom || !selectedCard || !user) return false;

    const userId = user.telegramId;
    if (!userId) return false;

    if ((user.balance || 0) < currentRoom.betAmount) {
      alert('Insufficient balance!');
      return false;
    }

    try {
      const cardRef = ref(rtdb, `rooms/${currentRoom.id}/bingoCards/${selectedCard.id}`);

      const result = await runTransaction(cardRef, (card: any) => {
        if (!card) return;
        if (card.claimed) return; // somebody else claimed
        card.claimed = true;
        card.claimedBy = userId;
        return card;
      });

      if (!result.committed) {
        alert('This card was already claimed by another player!');
        return false;
      }

      // Add player to room
      const playerRef = ref(rtdb, `rooms/${currentRoom.id}/players/${userId}`);
      await fbSet(playerRef, {
        telegramId: userId,
        username: user.username,
        betAmount: currentRoom.betAmount,
        cardId: selectedCard.id,
      });

      return true;
    } catch (err) {
      console.error('placeBet error', err);
      return false;
    }
  },

  // ----------------------
  // Cancel bet (unclaim + remove player)
  // ----------------------
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
      console.error('cancelBet error', err);
      return false;
    }
  },

  // ----------------------
  // Start game: this is called by ANY client when countdown ended.
  // A transaction ensures only one client actually creates the game and flips room to 'playing'.
  // The client that wins the transaction will create a deterministic sequence of numbers
  // and write the games/{gameId} payload. All clients then listen to games/{gameId}.
  // ----------------------
  startingGame: false,

  // Note: this helper may be called by clients periodically (e.g. via an effect) but
  // the transaction makes it safe.
  async startGameIfCountdownEnded() {
    const { currentRoom, startingGame } = get();
    if (!currentRoom || startingGame) return;
    if (currentRoom.gameStatus !== 'countdown' || !(currentRoom.countdownEndAt || 0)) return;
    if (Date.now() < (currentRoom.countdownEndAt || 0)) return; // not yet

    set({ startingGame: true });

    try {
      // Transaction on the room ensures only one client becomes the "starter"
      const roomRef = ref(rtdb, `rooms/${currentRoom.id}`);
      await runTransaction(roomRef, (room: any) => {
        if (!room) return;
        // double-check conditions server-side
        if (room.gameStatus === 'countdown' && (room.countdownEndAt || 0) <= Date.now() && !room.gameId) {
          room.gameStatus = 'playing';
          // reserve a gameId that we will create below
          room.gameId = 'pending';
        }
        return room;
      });

      // re-read to see if we became the starter
      const roomSnap = await fbGet(roomRef);
      const roomVal = roomSnap.val();
      if (!roomVal) return;

      if (roomVal.gameStatus !== 'playing' || roomVal.gameId !== 'pending') {
        // someone else started or conditions changed
        return;
      }

      // We are responsible for creating the game payload atomically and updating room.gameId to the real id
      const gamesRefRoot = ref(rtdb, 'games');
      const newGameRef = push(gamesRefRoot);
      const gameId = newGameRef.key as string;

      // deterministic seed uses roomId + countdownEndAt so all clients can generate same sequence if needed
      const seed = (hashCode(currentRoom.id) ^ (currentRoom.countdownEndAt || 0)) >>> 0;

      const numbers = seededShuffle(range(75), seed);
      const drawnNumbers = numbers; // full shuffled list
      const startedAt = Date.now();
      const drawIntervalMs = 3000;

      const payload: GamePayload = {
        drawnNumbers,
        startedAt,
        drawIntervalMs,
      };

      // write game payload
      await fbSet(ref(rtdb, `games/${gameId}`), payload);

      // update room with real gameId and clear countdown fields
      await update(ref(rtdb, `rooms/${currentRoom.id}`), {
        gameId,
        gameStatus: 'playing',
        countdownEndAt: null,
        countdownStartedBy: null,
        calledNumbers: [],
      });

      // done
    } catch (err) {
      console.error('startGameIfCountdownEnded error', err);
    } finally {
      set({ startingGame: false });
    }
  },

  // ----------------------
  // startNumberStream: listens to games/{gameId} and derives called numbers based on startedAt & interval
  // No one writes partial calledNumbers — it's derived by each client from the canonical drawnNumbers + startedAt
  // ----------------------
  startNumberStream: (roomId: string, gameId: string) => {
    if (!gameId) return;
    const gameRef = ref(rtdb, `games/${gameId}`);

    onValue(gameRef, (snapshot) => {
      const data = snapshot.val() as GamePayload | null;
      if (!data || !data.drawnNumbers || !data.startedAt) return;

      const { drawnNumbers, startedAt, drawIntervalMs } = data;

      // compute how many numbers should be visible now
      const elapsed = Date.now() - startedAt;
      const index = Math.max(0, Math.floor(elapsed / drawIntervalMs));
      const clampedIndex = Math.min(index, drawnNumbers.length);

      // Update displayedCalledNumbers for the room in local store
      set((state) => ({
        displayedCalledNumbers: {
          ...state.displayedCalledNumbers,
          [roomId]: drawnNumbers.slice(0, clampedIndex),
        },
      }));

      // If we've reached the end, trigger endGame transaction
      if (clampedIndex >= drawnNumbers.length) {
        // endGame via transaction to ensure only one client executes cleanup
        (async () => {
          try {
            const roomRef = ref(rtdb, `rooms/${roomId}`);
            await runTransaction(roomRef, (room: any) => {
              if (!room) return;
              if (room.gameStatus === 'playing') {
                room.gameStatus = 'ended';
                room.gameId = null;
                room.calledNumbers = [];
                room.countdownEndAt = null;
                room.countdownStartedBy = null;
                room.nextGameCountdownEndAt = Date.now() + 60 * 1000; // 1min cooldown
              }
              return room;
            });
          } catch (err) {
            console.error('endGame transaction error', err);
          }
        })();
      }
    });
  },

  // ----------------------
  // claimBingo: client calls this when they believe they have bingo
  // It reads games/{gameId} to fetch drawnNumbers up to now, validates the player's card,
  // and uses a transaction on the room to mark the winner atomically (first come wins after validation).
  // ----------------------
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
      const index = Math.max(0, Math.floor(elapsed / game.drawIntervalMs));
      const called = game.drawnNumbers.slice(0, Math.min(index, game.drawnNumbers.length));

      // validate card locally
      const cardNumbers = selectedCard.numbers;
      const isBingo = checkCardHasBingo(cardNumbers, called);
      if (!isBingo) return false;

      // Now try to atomically set winner in room
      const roomRef = ref(rtdb, `rooms/${currentRoom.id}`);
      const res = await runTransaction(roomRef, (room: any) => {
        if (!room) return;
        // if winner already set, reject
        if (room.winner) return;
        // still playing?
        if (room.gameStatus !== 'playing') return;
        room.winner = user.telegramId;
        room.payout = room.betAmount ? room.betAmount * (Object.keys(room.players || {}).length || 1) : 0; // simple payout calc
        room.gameStatus = 'ended';
        room.gameId = null;
        room.nextGameCountdownEndAt = Date.now() + 60 * 1000;
        return room;
      });

      return Boolean(res.committed);
    } catch (err) {
      console.error('claimBingo error', err);
      return false;
    }
  },

  // ----------------------
  // fetchBingoCards
  // ----------------------
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

      const user = useAuthStore.getState().user;
      const selectedCard = get().selectedCard;

      if (user) {
        const userCard = cards.find((c) => c.claimedBy === user.telegramId);
        if (userCard && (!selectedCard || selectedCard.id !== userCard.id)) {
          set({ selectedCard: userCard });
        } else if (!userCard && !selectedCard) {
          set({ selectedCard: null });
        }
      }
    });
  },
}));

// ----------------------
// Utility functions used above
// ----------------------
function checkCardHasBingo(numbers: number[][], calledNumbers: number[]) {
  // rows
  for (let r = 0; r < 5; r++) {
    if (numbers[r].every((n) => calledNumbers.includes(n))) return true;
  }
  // cols
  for (let c = 0; c < 5; c++) {
    if (numbers.every((row) => calledNumbers.includes(row[c]))) return true;
  }
  // diagonals
  const diag1 = [numbers[0][0], numbers[1][1], numbers[2][2], numbers[3][3], numbers[4][4]];
  const diag2 = [numbers[0][4], numbers[1][3], numbers[2][2], numbers[3][1], numbers[4][0]];
  if (diag1.every((n) => calledNumbers.includes(n)) || diag2.every((n) => calledNumbers.includes(n))) return true;
  return false;
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}
