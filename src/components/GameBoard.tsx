import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Clock, Trophy, AlertCircle } from 'lucide-react';
import { Room, Game, BingoCard as BingoCardType } from '../types';
import { useApp } from '../contexts/AppContext';
import { useTranslation } from '../utils/translations';
import BingoCard from './BingoCard';

interface GameBoardProps {
  room: Room;
  game: Game | null;
  availableCards: BingoCardType[];
  onBack: () => void;
  onSelectCard: (cardId: string) => void;
  onMarkNumber: (number: number) => void;
  onCallBingo: () => void;
}

const GameBoard: React.FC<GameBoardProps> = ({
  room,
  game,
  availableCards,
  onBack,
  onSelectCard,
  onMarkNumber,
  onCallBingo
}) => {
  const { user, language } = useApp();
  const t = useTranslation(language);
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [markedNumbers, setMarkedNumbers] = useState<number[]>([]);
  const [countdown, setCountdown] = useState<number>(0);

  const currentPlayer = game?.players.find(p => p.userId === user?.id);
  const selectedCard = availableCards.find(card => card.id === selectedCardId);

  useEffect(() => {
    if (game?.status === 'countdown' && game.countdownStart) {
      const startTime = new Date(game.countdownStart).getTime();
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        const remaining = Math.max(0, 30 - elapsed);
        setCountdown(remaining);
        
        if (remaining === 0) {
          clearInterval(interval);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [game?.status, game?.countdownStart]);

  const handleCardSelect = (cardId: string) => {
    setSelectedCardId(cardId);
    onSelectCard(cardId);
  };

  const handleNumberClick = (number: number) => {
    if (!markedNumbers.includes(number) && game?.drawnNumbers.includes(number)) {
      const newMarkedNumbers = [...markedNumbers, number];
      setMarkedNumbers(newMarkedNumbers);
      onMarkNumber(number);
    }
  };

  const getGameStatusText = () => {
    if (!game) return t.waiting;
    
    switch (game.status) {
      case 'waiting':
        return `${t.waiting} (${game.players.length}/${room.maxPlayers})`;
      case 'countdown':
        return `${t.countdown} ${countdown} ${t.seconds}`;
      case 'playing':
        return t.playing;
      case 'finished':
        return t.finished;
      default:
        return t.waiting;
    }
  };

  const canCallBingo = game?.status === 'playing' && currentPlayer && markedNumbers.length >= 5;
  const showCardSelector = !currentPlayer && game?.status === 'waiting';
  const showGameArea = currentPlayer && selectedCard;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-md p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">{t.backToRooms}</span>
          </button>
          
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-800">{room.name}</h1>
            <div className="flex items-center justify-center space-x-4 mt-1">
              <div className="flex items-center space-x-1 text-gray-600">
                <Users className="w-4 h-4" />
                <span className="text-sm">{game?.players.length || 0}/{room.maxPlayers}</span>
              </div>
              {!room.isDemo && (
                <div className="text-sm text-blue-600 font-medium">
                  {room.betAmount.toLocaleString()} {t.birr}
                </div>
              )}
            </div>
          </div>
          
          <div className="w-20"></div> {/* Spacer for balance */}
        </div>
        
        {/* Game Status */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">{t.gameStatus}:</span>
            </div>
            <span className="text-sm text-blue-700">{getGameStatusText()}</span>
          </div>
          
          {game?.status === 'countdown' && (
            <div className="mt-2 text-center">
              <div className="text-2xl font-bold text-orange-600">{countdown}</div>
              <div className="text-sm text-orange-700">{t.gameStartingSoon}</div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Card Selector */}
        {showCardSelector && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">{t.selectCard}</h2>
            <select
              value={selectedCardId}
              onChange={(e) => handleCardSelect(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t.chooseDifferentCard}</option>
              {availableCards.map(card => (
                <option key={card.id} value={card.id}>
                  Card #{card.serialNumber}
                </option>
              ))}
            </select>
            
            {user && !room.isDemo && (
              <div className="mt-2 text-sm text-gray-600">
                {user.balance < room.betAmount ? (
                  <div className="flex items-center space-x-1 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span>{t.notEnoughBalance}</span>
                  </div>
                ) : (
                  <span>Balance after bet: {(user.balance - room.betAmount).toLocaleString()} {t.birr}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Game Area */}
        {showGameArea && (
          <div className="space-y-6">
            {/* Drawn Numbers */}
            {game && game.drawnNumbers.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">{t.drawnNumbers}</h3>
                <div className="flex flex-wrap gap-2">
                  {game.drawnNumbers.map(number => (
                    <div
                      key={number}
                      className="w-10 h-10 bg-yellow-500 text-white rounded-full flex items-center justify-center font-semibold text-sm"
                    >
                      {number}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bingo Card */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">{t.yourCard}</h3>
                {canCallBingo && (
                  <button
                    onClick={onCallBingo}
                    className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-2 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg animate-pulse"
                  >
                    <Trophy className="w-5 h-5 inline-block mr-2" />
                    {t.bingo}
                  </button>
                )}
              </div>
              
              <BingoCard
                card={selectedCard}
                markedNumbers={markedNumbers}
                drawnNumbers={game?.drawnNumbers || []}
                onNumberClick={handleNumberClick}
                isInteractive={game?.status === 'playing'}
              />
            </div>

            {/* Game Info */}
            {game && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg shadow-md p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{game.players.length}</div>
                  <div className="text-sm text-gray-600">{t.currentPlayers}</div>
                </div>
                
                <div className="bg-white rounded-lg shadow-md p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {game.totalPot.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">Total Pot ({t.birr})</div>
                </div>
                
                <div className="bg-white rounded-lg shadow-md p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">{game.drawnNumbers.length}</div>
                  <div className="text-sm text-gray-600">{t.drawnNumbers}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Waiting Message */}
        {!showCardSelector && !showGameArea && (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-600 mb-2">{t.waitingForNextGame}</h2>
            <p className="text-gray-500">{t.minPlayersRequired}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameBoard;