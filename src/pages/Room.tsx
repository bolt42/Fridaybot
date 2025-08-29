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
  const { currentRoom, bingoCards, joinRoom, selectCard, placeBet, checkBingo } = useGameStore();
  const { user, updateBalance } = useAuthStore();
  
const [selectedCard, setSelectedCard] = useState(1);
  const [markedNumbers, setMarkedNumbers] = useState<number[]>([]);
  const [hasBet, setHasBet] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [gameMessage, setGameMessage] = useState('');

  React.useEffect(() => {
    if (roomId) {
      joinRoom(roomId);
    }
  }, [roomId, joinRoom]);
  const generateCard = () => {
    const nums = Array.from({ length: 100 }, (_, i) => i + 1);
    return nums.sort(() => Math.random() - 0.5).slice(0, 25);
  };

  const cards = [generateCard(), generateCard(), generateCard()];
  const cardNumbers = cards[selectedCard - 1];
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

  const handleNumberClick = (num: number) => {
    setMarkedNumbers((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );
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
    <div className="min-h-screen bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 flex flex-col items-center p-2 text-white">
  {/* Header Info */}
  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 mb-3 w-full text-xs">
    {["Game EQ7431", "Derash -", "Bonus -", "Players -", "Bet 0", "Call 0"].map(
      (item, idx) => (
        <div
          key={idx}
          className="bg-white/10 rounded text-center py-1 border border-white/20"
        >
          {item}
        </div>
      )
    )}
  </div>

  {/* Main content in one row */}
  <div className="flex flex-row gap-2 w-full max-w-full">
    {/* Called Numbers */}
    <div className="flex-1 bg-white/10 p-2 rounded border border-white/20 max-h-[280px] text-xs overflow-y-auto">
      <h3 className="text-center font-bold mb-1 text-sm">Called</h3>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 100 }, (_, i) => i + 1).map((num) => (
          <div
            key={num}
            className="w-6 h-6 flex items-center justify-center rounded bg-white/20 font-bold text-[10px]"
          >
            {num}
          </div>
        ))}
      </div>
    </div>

    {/* Current Call */}
    <div className="flex flex-col items-center justify-center bg-white/10 p-2 rounded border border-white/20 min-w-[80px]">
      <span className="text-[10px] mb-1">Current</span>
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-lg font-bold shadow">
        -
      </div>
    

    {/* Your Card */}
    <div className="flex-1 bg-white/10 p-2 rounded border border-white/20 text-xs">
      <div className="flex justify-between items-center mb-1">
        <h3 className="font-bold text-sm">Your Card</h3>
        <select
          value={selectedCard}
          onChange={(e) => setSelectedCard(Number(e.target.value))}
          className="bg-white/20 text-white rounded px-1 py-0.5 text-[10px]"
        >
          <option value={1}>Card 1</option>
          <option value={2}>Card 2</option>
          <option value={3}>Card 3</option>
        </select>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {cardNumbers.map((num) => {
          const isMarked = markedNumbers.includes(num);
          return (
            <div
              key={num}
              onClick={() => handleNumberClick(num)}
              className={`w-8 h-8 flex items-center justify-center rounded font-bold text-[11px] cursor-pointer transition
                ${isMarked ? "bg-green-500 text-white scale-105" : "bg-white/20 hover:bg-white/30"}
              `}
            >
              {num}
            </div>
          );
        })}
      </div>
    </div></div>
  </div>

  {/* Bottom buttons */}
  <div className="flex flex-row gap-2 mt-3 w-full">
    <button className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-500 py-2 rounded font-bold text-sm shadow hover:opacity-90 transition">
      BINGO!
    </button>
    <button className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 py-2 rounded font-bold text-sm shadow hover:opacity-90 transition">
      Refresh
    </button>
    <button className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 py-2 rounded font-bold text-sm shadow hover:opacity-90 transition">
      Leave
    </button>
  </div>
</div>
  );
};

export default Room;