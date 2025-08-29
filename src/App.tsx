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
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();

    console.log("Telegram initDataUnsafe:", tg.initDataUnsafe);

    const user = tg.initDataUnsafe?.user;
    if (user) {
      initializeUser({
        telegramId: user.id.toString(),
        username: user.username || `${user.first_name || "user"}_${user.id}`,
        language: "en",
      });
      return;
    }
  }

  // 🚨 If you reach here, it means no Telegram user is passed
  console.warn("No Telegram user found, using demo mode");
  initializeUser({
    telegramId: "demo123",
    username: "demo_user",
    language: "en",
  });
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