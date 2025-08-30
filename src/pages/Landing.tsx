import React from 'react';
import { Trophy, Users, Sparkles } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useGameStore } from '../store/gameStore';
import RoomCard from '../components/RoomCard';

const Landing: React.FC = () => {
  const { t } = useLanguageStore();
  const { rooms, fetchRooms } = useGameStore();

  React.useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);


  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <Trophy className="w-12 h-12 text-yellow-400" />
          <h1 className="text-4xl md:text-6xl font-bold text-white">
            {t('friday_bingo')}
          </h1>
        </div>
        
        <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
          {t('welcome')}
        </p>
        
        <div className="flex items-center justify-center space-x-8 text-white/60">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>Multiplayer</span>
          </div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5" />
            <span>Real-time</span>
          </div>
          <div className="flex items-center space-x-2">
            <Trophy className="w-5 h-5" />
            <span>Win Prizes</span>
          </div>
        </div>
      </div>

      {/* Rooms Section */}
      <div className="mb-8">
       <h2 className="text-2xl font-bold text-white mb-6 flex items-center space-x-2">
  <span>{t('available_rooms')}</span>
  <span className="bg-white/20 text-sm px-2 py-1 rounded-full">
    {rooms.length}
  </span>
</h2>

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {rooms.map((room) => (
    <RoomCard key={room.id} room={room} />
  ))}
</div>

      </div>

      {/* Footer */}
      <div className="text-center mt-16 pt-8 border-t border-white/20">
        <p className="text-white/60 text-sm">
          Made by <span className="font-bold text-white">BOLT4L</span>
        </p>
      </div>
    </div>
  );
};

export default Landing;