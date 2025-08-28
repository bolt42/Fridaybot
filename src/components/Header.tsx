import React from 'react';
import { Globe, Coins } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTranslation } from '../utils/translations';

const Header: React.FC = () => {
  const { user, language, setLanguage } = useApp();
  const t = useTranslation(language);

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'am' : 'en');
  };

  return (
    <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <span className="text-blue-600 font-bold text-lg">FB</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">{t.appName}</h1>
              <p className="text-blue-200 text-sm">{t.createdBy}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleLanguage}
              className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-colors duration-200"
              aria-label={t.language}
            >
              <Globe className="w-4 h-4" />
              <span className="text-sm font-medium">
                {language === 'en' ? '🇬🇧' : '🇪🇹'}
              </span>
            </button>
            
            {user && (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm opacity-90">@{user.username}</p>
                  <div className="flex items-center space-x-1">
                    <Coins className="w-4 h-4 text-yellow-300" />
                    <span className="font-semibold">{user.balance.toLocaleString()}</span>
                    <span className="text-sm opacity-90">{t.birr}</span>
                  </div>
                </div>
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold">
                    {user.firstName?.charAt(0) || user.username.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;