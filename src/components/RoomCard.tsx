import React from 'react';
import { Users, Coins, Play } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useNavigate } from 'react-router-dom';

interface Room {
  id: string;
  name: string;
  betAmount: number;
  maxPlayers: number;
  currentPlayers: number;
  status: string;
  isDemoRoom?: boolean;
}

interface RoomCardProps {
  room: Room;
}

const RoomCard: React.FC<RoomCardProps> = ({ room }) => {
  const { t } = useLanguageStore();
  const navigate = useNavigate();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400';
      case 'waiting':
        return 'text-yellow-400';
      case 'in_progress':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const handleJoinRoom = () => {
    navigate(`/room/${room.id}`);
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6 hover:bg-white/15 transition-all duration-300 hover:scale-105">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-xl">{room.name}</h3>
        {room.isDemoRoom && (
          <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
            {t('free_play')}
          </span>
        )}
      </div>
      
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-white/70">{t('bet_amount')}:</span>
          <div className="flex items-center space-x-1">
            <Coins className="w-4 h-4 text-yellow-400" />
            <span className="text-white font-medium">
              {room.isDemoRoom ? t('free_play') : Number(room.betAmount ?? 0).toFixed(2)}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-white/70">{t('players')}:</span>
          <div className="flex items-center space-x-1">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-white">{room.currentPlayers}/{room.maxPlayers}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-white/70">{t('status')}:</span>
          <span className={`font-medium ${getStatusColor(room.status)}`}>
            {t(room.status)}
          </span>
        </div>
      </div>
      
      <button
        onClick={handleJoinRoom}
        className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl"
      >
        <Play className="w-4 h-4" />
        <span>{t('join_room')}</span>
      </button>
    </div>
  );
};

export default RoomCard;