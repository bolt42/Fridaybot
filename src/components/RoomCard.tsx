import React from 'react';
import { Users, Coins, Play } from 'lucide-react';
import { Room } from '../types';
import { useApp } from '../contexts/AppContext';
import { useTranslation } from '../utils/translations';

interface RoomCardProps {
  room: Room;
  playerCount?: number;
  onJoin: (roomId: string) => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, playerCount = 0, onJoin }) => {
  const { language } = useApp();
  const t = useTranslation(language);

  const handleJoin = () => {
    onJoin(room.id);
  };

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border border-gray-100 overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              {room.name}
            </h3>
            {room.isDemo && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {t.freePlay}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-1 text-gray-600">
            <Users className="w-4 h-4" />
            <span className="text-sm">{playerCount}/{room.maxPlayers}</span>
          </div>
        </div>
        
        <div className="space-y-3">
          {!room.isDemo && (
            <div className="flex items-center justify-between py-2 px-3 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium text-blue-700">{t.betAmount}:</span>
              <div className="flex items-center space-x-1">
                <Coins className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-blue-800">
                  {room.betAmount.toLocaleString()} {t.birr}
                </span>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{t.currentPlayers}:</span>
            <span className="font-medium">{playerCount} / {room.maxPlayers}</span>
          </div>
        </div>
        
        <button
          onClick={handleJoin}
          disabled={!room.isActive}
          className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 shadow-md hover:shadow-lg disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          <span>{t.joinRoom}</span>
        </button>
      </div>
    </div>
  );
};

export default RoomCard;