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
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-white hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Rooms</span>
        </button>
        
        <h1 className="text-2xl font-bold text-white">{currentRoom.name}</h1>
      </div>

      {/* Room Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/20 p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Coins className="w-5 h-5 text-yellow-400" />
            <span className="text-white font-medium">{t('bet_amount')}</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {currentRoom.isDemoRoom ? t('free_play') : `${Number(currentRoom.betAmount ?? 0).toFixed(2)}`}
          </div>
        </div>
        
        <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/20 p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Users className="w-5 h-5 text-blue-400" />
            <span className="text-white font-medium">{t('players')}</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {currentRoom.currentPlayers}/{currentRoom.maxPlayers}
          </div>
        </div>
        
        <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/20 p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Trophy className="w-5 h-5 text-green-400" />
            <span className="text-white font-medium">{t('payout')}</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {currentRoom.isDemoRoom 
              ? t('free_play') 
              : `${Number(currentRoom.currentPlayers ?? 0) * Number(currentRoom.betAmount ?? 0) * 0.9 === 0 ? '0.00' : (Number(currentRoom.currentPlayers ?? 0) * Number(currentRoom.betAmount ?? 0) * 0.9).toFixed(2)}`
            }
          </div>
        </div>
      </div>

      {/* Game Message */}
      {gameMessage && (
        <div className="bg-blue-500/20 border border-blue-400/50 rounded-lg p-4 mb-6">
          <p className="text-white text-center font-medium">{gameMessage}</p>
        </div>
      )}

      {/* Countdown */}
      {countdown > 0 && (
        <div className="bg-orange-500/20 border border-orange-400/50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center space-x-2 text-white">
            <Clock className="w-5 h-5" />
            <span className="font-medium">
              {t('game_starts_in')} {countdown} {t('seconds')}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Game Controls */}
        <div className="space-y-6">
          {/* Card Selection */}
          {!hasBet && (
            <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/20 p-4">
              <h3 className="text-white font-medium mb-4">{t('select_card')}</h3>
              <select
                onChange={(e) => handleCardSelect(e.target.value)}
                value={selectedCard?.id || ''}
                className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white"
              >
                <option value="">{t('select_card')}</option>
                {bingoCards.slice(0, 10).map(card => (
                  <option key={card.id} value={card.id} disabled={card.claimed}>
                    {t('card_number')}{card.serialNumber} {card.claimed ? '(Taken)' : ''}
                  </option>
                ))}
              </select>
              
              {selectedCard && !hasBet && (
                <button
                  onClick={handlePlaceBet}
                  className="w-full mt-4 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200"
                >
                  {t('place_bet')} {currentRoom.isDemoRoom ? '' : `(${currentRoom.betAmount})`}
                </button>
              )}
            </div>
          )}

          {/* Called Numbers */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/20 p-4">
            <h3 className="text-white font-medium mb-4">{t('numbers_called')}</h3>
            <div className="flex flex-wrap gap-2">
              {displayedCalledNumbers.map(number => (
                <span
                  key={number}
                  className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium"
                >
                  {number}
                </span>
              ))}
            </div>
          </div>

          {/* Bingo Button */}
          {hasBet && (
            <button
              onClick={handleBingoClick}
              className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold py-4 px-6 rounded-lg text-xl transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              {t('bingo')}
            </button>
          )}
        </div>

        {/* Bingo Grid */}
        <div className="lg:col-span-2">
          <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/20 p-6">
            <h3 className="text-white font-medium mb-6 text-center">
              {t('game_area')} - {t('card_number')}{displayedCard.serialNumber}
            </h3>
            <BingoGrid
              cardNumbers={displayedCard.numbers}
              calledNumbers={displayedCalledNumbers}
              onNumberClick={handleNumberClick}
              markedNumbers={markedNumbers}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Room;