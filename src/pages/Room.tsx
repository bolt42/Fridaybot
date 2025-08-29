import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Coins, Clock, Trophy } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import BingoGrid from '../components/BingoGrid';

const Room: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const { currentRoom, selectedCard, bingoCards, joinRoom, selectCard, placeBet, checkBingo } = useGameStore();
  const { user, updateBalance } = useAuthStore();
  
  const [markedNumbers, setMarkedNumbers] = useState<Set<number>>(new Set());
  const [hasBet, setHasBet] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [gameMessage, setGameMessage] = useState('');

  React.useEffect(() => {
    if (roomId) {
      joinRoom(roomId);
    }
  }, [roomId, joinRoom]);

  React.useEffect(() => {
    if (currentRoom?.gameStatus === 'countdown' && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [currentRoom?.gameStatus, countdown]);

  const handleCardSelect = (cardId: string) => {
    if (!hasBet) {
      selectCard(cardId);
    }
  };

  const handlePlaceBet = async () => {
    if (!selectedCard || !currentRoom || !user) return;
    
    if (!currentRoom.isDemoRoom && (user.balance || 0) < currentRoom.betAmount) {
      setGameMessage('Insufficient balance!');
      return;
    }
    
    const success = await placeBet();
    if (success) {
      setHasBet(true);
      if (!currentRoom.isDemoRoom) {
        await updateBalance(-currentRoom.betAmount);
      }
      setGameMessage('Bet placed! Waiting for other players...');
      
      // Simulate countdown start when enough players
      setTimeout(() => {
        setCountdown(30);
      }, 2000);
    }
  };

  const handleNumberClick = (number: number) => {
    if (!currentRoom?.calledNumbers.includes(number)) return;
    
    setMarkedNumbers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(number)) {
        newSet.delete(number);
      } else {
        newSet.add(number);
      }
      return newSet;
    });
  };

  const handleBingoClick = async () => {
    const isBingo = await checkBingo();
    if (isBingo && currentRoom) {
      const payout = currentRoom.currentPlayers * currentRoom.betAmount * 0.9;
      setGameMessage(t('you_won'));
      if (!currentRoom.isDemoRoom) {
        await updateBalance(payout);
      }
    } else {
      setGameMessage(t('not_a_winner'));
    }
    
    setTimeout(() => {
      setGameMessage('');
    }, 3000);
  };

  if (!currentRoom) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-4"></div>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Demo called numbers for visualization
  const demoCalledNumbers = [7, 23, 45, 62, 8, 19, 31, 58, 14];
  const displayedCalledNumbers = (currentRoom?.calledNumbers?.length ?? 0) > 0
  ? currentRoom!.calledNumbers!
  : demoCalledNumbers;

  // Demo card for visualization
  const demoCard = {
    id: 'demo',
    serialNumber: 42,
    claimed: false,
    numbers: [
      [7, 16, 31, 46, 61],
      [3, 23, 34, 52, 67],
      [12, 28, 0, 58, 74], // 0 represents FREE space
      [1, 19, 45, 49, 62],
      [14, 25, 38, 55, 69]
    ]
  };

  const displayedCard = selectedCard || demoCard;

 return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 flex flex-col items-center p-4 text-white">
      
      {/* Top info row */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6 w-full max-w-5xl">
        {["Game EQ7431", "Derash -", "Bonus -", "Players -", "Bet 0", "Call 0"].map(
          (item, idx) => (
            <div
              key={idx}
              className="bg-white/10 backdrop-blur-md rounded-lg text-center py-3 font-semibold border border-white/20"
            >
              {item}
            </div>
          )
        )}
      </div>

      {/* Middle section */}
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-5xl">
        
        {/* Left: Called numbers */}
        <div className="flex-1 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 overflow-y-auto max-h-[400px]">
          <h3 className="text-center font-bold mb-3">Called Numbers</h3>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {Array.from({ length: 100 }, (_, i) => i + 1).map((num) => (
              <div
                key={num}
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-white/20 font-bold text-xs sm:text-sm"
              >
                {num}
              </div>
            ))}
          </div>
        </div>

        {/* Right side: Current call + card (always row, scrollable if needed) */}
        <div className="flex flex-row gap-6 flex-1 overflow-x-auto min-w-full">
          
          {/* Current Call */}
          <div className="flex flex-col items-center justify-center bg-white/10 backdrop-blur-md p-6 rounded-xl border border-white/20 min-w-[200px]">
            <span className="text-lg font-medium mb-2">Current Call</span>
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-3xl font-bold shadow-lg">
              -
            </div>
          </div>

          {/* Your Card */}
          <div className="flex-1 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 min-w-[280px]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold">Your Card</h3>
              {/* Dropdown */}
              <select className="bg-white/20 text-white rounded px-2 py-1 text-sm outline-none">
                <option>Card 1</option>
                <option>Card 2</option>
                <option>Card 3</option>
              </select>
            </div>

            {/* 5x5 Card Grid */}
            <div className="grid grid-cols-5 gap-2">
              {cardNumbers.map((num) => {
                const isMarked = markedNumbers.includes(num);
                return (
                  <div
                    key={num}
                    onClick={() => handleNumberClick(num)}
                    className={`w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-lg font-bold cursor-pointer transition
                      ${isMarked ? "bg-green-500 text-white scale-105" : "bg-white/20 hover:bg-white/30"}
                    `}
                  >
                    {num}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full max-w-3xl">
        <button className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-500 py-4 rounded-xl font-bold text-lg shadow-lg hover:opacity-90 transition">
          BINGO!
        </button>
        <button className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 py-4 rounded-xl font-bold text-lg shadow-lg hover:opacity-90 transition">
          Refresh
        </button>
        <button className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 py-4 rounded-xl font-bold text-lg shadow-lg hover:opacity-90 transition">
          Leave
        </button>
      </div>
    </div>
  );
};

export default Room;