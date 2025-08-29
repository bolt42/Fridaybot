import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useLanguageStore } from './store/languageStore';
import Landing from './pages/Landing';
import Room from './pages/Room';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import './firebase/config';

function App() {
  const { user, loading, initializeUser } = useAuthStore();
  const { language } = useLanguageStore();

  React.useEffect(() => {
    // Initialize user from Telegram WebApp
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      
      const initData = tg.initDataUnsafe;
      if (initData?.user) {
        initializeUser({
          id: initData.user.id.toString(),
          username: initData.user.username || `user_${initData.user.id}`,
          firstName: initData.user.first_name || '',
          lastName: initData.user.last_name || ''
        });
      }
    } else {
      // Demo mode for testing
      initializeUser({
        id: 'demo123',
        username: 'demo_user',
        firstName: 'Demo',
        lastName: 'User'
      });
    }
  }, [initializeUser]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-800">
      <Router>
        <Header />
        <main className="pt-20">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/room/:roomId" element={<Room />} />
          </Routes>
        </main>
      </Router>
    </div>
  );
}

export default App;