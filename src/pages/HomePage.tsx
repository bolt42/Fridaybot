import React from 'react';
import { Users, Play, Gift } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTranslation } from '../utils/translations';
import RoomCard from '../components/RoomCard';

interface HomePageProps {
  onJoinRoom: (roomId: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onJoinRoom }) => {
  const { user, rooms, language } = useApp();
  const t = useTranslation(language);

  const demoRoom = rooms.find(room => room.isDemo);
  const regularRooms = rooms.filter(room => !room.isDemo && room.isActive);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="text-center mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
            <h1 className="text-3xl font-bold mb-2">{t.appName}</h1>
            <p className="text-blue-100 mb-4">
              Welcome{user?.firstName ? `, ${user.firstName}` : ''}! Ready to play some Bingo?
            </p>
            <div className="flex items-center justify-center space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5" />
                <span>{rooms.length} {t.rooms}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Play className="w-5 h-5" />
                <span>Live Games</span>
              </div>
              <div className="flex items-center space-x-2">
                <Gift className="w-5 h-5" />
                <span>Free Demo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Demo Room Section */}
        {demoRoom && (
          <div className="mb-8">
            <div className="flex items-center space-x-2 mb-4">
              <Gift className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-semibold text-gray-800">{t.demoRoom}</h2>
            </div>
            <div className="grid grid-cols-1 max-w-md">
              <RoomCard
                room={demoRoom}
                playerCount={0}
                onJoin={onJoinRoom}
              />
            </div>
          </div>
        )}

        {/* Regular Rooms Section */}
        <div>
          <div className="flex items-center space-x-2 mb-4">
            <Play className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-800">{t.rooms}</h2>
          </div>
          
          {regularRooms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularRooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  playerCount={0}
                  onJoin={onJoinRoom}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg shadow-md">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-500 mb-2">No active rooms</h3>
              <p className="text-gray-400">Check back later for new games!</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 py-6 border-t border-gray-200">
          <p className="text-gray-500 text-sm">{t.createdBy}</p>
        </div>
      </div>
    </div>
  );
};

export default HomePage;