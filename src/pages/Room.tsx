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
   

  const { currentRoom, bingoCards, joinRoom, selectCard, placeBet, checkBingo , selectedCard } = useGameStore();
  const { user, updateBalance } = useAuthStore();
 const userCard = bingoCards.find(
      (card) => card.claimedBy === user?.telegramId
    );
     const displayedCard = userCard || selectedCard ;
 const cardNumbers = displayedCard?.numbers ?? [];
  const [markedNumbers, setMarkedNumbers] = useState<number[]>([]);
  const [hasBet, setHasBet] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [gameMessage, setGameMessage] = useState('');


  const cancelBet = useGameStore((state) => state.cancelBet);

  

  React.useEffect(() => {
    if (roomId) {
      joinRoom(roomId);
    }
  }, [roomId, joinRoom]);
  React.useEffect(() => {
    

    if (userCard) {
      selectCard(userCard.id); // auto-select the user's card
    }
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
  }, [currentRoom?.gameStatus, countdown,selectCard]);

  const handleCardSelect = (cardId: string) => {
    if (!hasBet) {
      selectCard(cardId);
    }
  };

  const handlePlaceBet = async () => {
  if (!selectedCard || !currentRoom) return;

  if (!currentRoom.isDemoRoom && (user?.balance || 0) < currentRoom.betAmount) {
    setGameMessage('Insufficient balance!');
    return;
  }

  const success = await placeBet();

  if (success) {
    setHasBet(true); // ✅ mark bet placed
    if (!currentRoom.isDemoRoom) {
      await updateBalance(-currentRoom.betAmount);
    }
    setGameMessage('Bet placed! Waiting for other players...');
    
    setTimeout(() => {
      setCountdown(30);
    }, 2000);
  }
};

const handleCancelBet = async () => {
  const success = await cancelBet();
  if (success) {
    setHasBet(false); // ✅ reset to allow placing again
    setGameMessage('Bet canceled');
  } else {
    console.error("❌ Failed to cancel bet");
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
 


 return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 via-purple-900 to-blue-900 flex flex-col items-center p-2 text-white">
  {/* Header Info */}
{/* Header Info Dashboard */}
  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 mb-3 w-full text-xs">
  <div className="bg-white/10 rounded text-center py-1 border border-white/20">
    {t('room_details')}: {currentRoom.id}
  </div>
  <div className="bg-white/10 rounded text-center py-1 border border-white/20">
    {t('payout')}: {Math.floor(currentRoom.currentPlayers * currentRoom.betAmount * 0.9)}
  </div>
  <div className="bg-white/10 rounded text-center py-1 border border-white/20">
  {t('game_status')}: {currentRoom?.gameStatus ?? t('waiting')}
</div>

  <div className="bg-white/10 rounded text-center py-1 border border-white/20">
    {t('players')}: {currentRoom.currentPlayers}
  </div>
  <div className="bg-white/10 rounded text-center py-1 border border-white/20">
    {t('bet_amount')}: {currentRoom.betAmount}
  </div>
  <div className="bg-white/10 rounded text-center py-1 border border-white/20">
    {t('numbers_called')}: {(currentRoom?.calledNumbers?.length ?? 0) > 0 ? currentRoom.calledNumbers!.at(-1) : "-"}
  </div>
</div>


  {/* Main content in one row */}
<div className="flex flex-row gap-2 w-full max-w-full">
  {/* Left side = 40% (Called numbers + Current call) */}
  <div className="w-2/5 flex flex-col gap-2">
    {/* Called Numbers */}
    <div className="bg-white/10 p-2 rounded border border-white/20 max-h-[400px] text-xs overflow-y-auto">
   
      {/* Bingo Header Row */}
      <div className="grid grid-cols-5 gap-1 mb-1">
        {["B", "I", "N", "G", "O"].map((letter) => (
          <div
            key={letter}
            className="w-6 h-6 flex items-center justify-center font-bold text-[12px] bg-purple-600 rounded"
          >
            {letter}
          </div>
        ))}
      </div>

      {/* Numbers Grid */}
      <div className="grid grid-cols-5 gap-1">
        {[...Array(15)].map((_, rowIdx) =>
          ["B", "I", "N", "G", "O"].map((col, colIdx) => {
            const num = rowIdx + 1 + colIdx * 15;
            const isCalled = displayedCalledNumbers.includes(num);

            return (
              <div
                key={`${col}-${num}`}
                className={`w-6 h-6 flex items-center justify-center rounded font-bold text-[10px] transition
                  ${isCalled ? "bg-green-500 text-white scale-105" : "bg-white/20"}
                `}
              >
                {num}
              </div>
            );
          })
        )}
      </div>
    </div>

    {/* Current Call */}
   
  </div>

  {/* Right side = 60% (Your Card) */}
  <div className="w-3/5 bg-white/10 p-2 rounded border border-white/20 text-xs">
   <div className="flex flex-col items-center justify-center bg-white/10 p-2 rounded border border-white/20 min-h-[100px]">
      <span className="text-[10px] mb-1">Current</span>
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-lg font-bold shadow">
        -
      </div>
    </div>
    {/* Card header */}
    <div className="flex justify-between items-center mb-1">
      <h3 className="font-bold text-sm">{t('select_card')}</h3>
      <select
        value={selectedCard?.id ?? ''}
        onChange={(e) => selectCard(e.target.value)}
        className="bg-white/20 text-white rounded px-1 py-0.5 text-[10px]"
      >
        <option value="" disabled>Select Card</option>
        {bingoCards
          .slice()
          .sort((a, b) => a.serialNumber - b.serialNumber)
          .map((card) => (
            <option key={card.id} value={card.id} disabled={card.claimed}>
              Card {card.serialNumber} {card.claimed ? "(claimed)" : ""}
            </option>
          ))}
      </select>
    </div>

    {/* Bingo Header Row */}
    <div className="grid grid-cols-5 gap-1 mb-1">
      {["B", "I", "N", "G", "O"].map((letter) => (
        <div
          key={letter}
          className="w-8 h-8 flex items-center justify-center font-bold text-[12px] bg-purple-600 rounded"
        >
          {letter}
        </div>
      ))}
    </div>

    {/* Numbers Grid */}
    <div className="grid grid-cols-5 gap-1">
      {cardNumbers.flat().map((num, idx) => {
        const isMarked = markedNumbers.includes(num);
        return (
          <div
            key={`${num}-${idx}`}
            onClick={() => handleNumberClick(num)}
            className={`w-8 h-8 flex items-center justify-center rounded font-bold text-[11px] cursor-pointer transition
              ${isMarked ? "bg-green-500 text-white scale-105" : "bg-white/20 hover:bg-white/30"}
            `}
          >
            {num === 0 ? "★" : num}
          </div>
        );
      })}
    </div>

    {/* Bet button */}
    {selectedCard ? (
      <div className="mt-6">
       <button
  onClick={hasBet ? handleCancelBet : handlePlaceBet}
  className={`mt-4 px-4 py-2 rounded-lg shadow font-semibold ${
    hasBet
      ? "bg-red-600 hover:bg-red-700 text-white" // Cancel Bet
      : "bg-blue-600 hover:bg-blue-700 text-white" // Place Bet
  }`}
>
  {hasBet ? t("cancel_bet") : t("place_bet")}
</button>

      </div>
    ) : (
      <p className="mt-6 text-gray-400">No card selected yet...</p>
    )}
  </div>
</div>


  {/* Bottom buttons */}
  <div className="flex flex-row gap-2 mt-3 w-full">
  <button className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-500 py-2 rounded font-bold text-sm shadow hover:opacity-90 transition">
    {t('bingo')}
  </button>
  <button className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 py-2 rounded font-bold text-sm shadow hover:opacity-90 transition">
    {t('refresh')}
  </button>
  <button className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 py-2 rounded font-bold text-sm shadow hover:opacity-90 transition">
    {t('leave')}
  </button>
</div>
  {/* Footer: Betted Players */}
<div className="w-full mt-6 bg-white/10 rounded border border-white/20 p-3">
  <h3 className="font-bold text-sm mb-2">Players in this room</h3>
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
    {currentRoom?.players && Object.keys(currentRoom.players || {}).length > 0 ? (
  Object.values(currentRoom.players || {}).map((player: any) => {
    const maskedUsername = player.username
      ? `${player.username.slice(0, 3)}***`
      : `user_${player.id.slice(0, 3)}***`;

    return (
      <div
        key={player.id}
        className="bg-white/20 rounded p-2 flex flex-col items-center text-center"
      >
        <span className="font-semibold">{maskedUsername}</span>
        <span className="text-xs">Bet: {player.betAmount}</span>
      </div>
    );
  })
) : (
  <div className="col-span-full text-center text-gray-300">
    No players have bet yet...
  </div>
)}

  </div>
</div>

</div>
  );
};

export default Room;