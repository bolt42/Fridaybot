import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useLanguageStore } from './store/languageStore';
import Landing from './pages/Landing';
import Room from './pages/Room';
import User from './pages/User';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import './firebase/config';
import { getOrCreateUser } from './services/firebaseApi';

function App() {
  const { user, loading, initializeUser } = useAuthStore();
  const { language } = useLanguageStore();

  React.useEffect(() => {
  const initUser = async () => {
    if (window.Telegram?.WebApp) {
     

  const tg: any = window.Telegram.WebApp;
  tg.ready();

console.log("initData:", tg.initData);
console.log("initDataUnsafe:", tg.initDataUnsafe);
      
      const tgUser = tg.initDataUnsafe?.user;
      if (tgUser) {
        const userData = await getOrCreateUser({
          telegramId: tgUser.id.toString(),
          username: tgUser.username || `${tgUser.first_name || "user"}_${tgUser.id}`,
          language: "en",
        });

        initializeUser(userData);
        return;
      }
    }

    // 🚨 fallback demo user
    console.warn("No Telegram user found, using demo mode");
    const demoUser = await getOrCreateUser({
      telegramId: "demo123",
      username: "demo_user",
      language: "en",
    });
    initializeUser(demoUser);
  };

  initUser();
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
            <Route path="/user" element={<User />} />
          </Routes>
        </main>
      </Router>
    </div>
  );
}

export default App;