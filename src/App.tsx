import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useLanguageStore } from './store/languageStore';
import Landing from './pages/Landing';
import Room from './pages/Room';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import './firebase/config';
import { getOrCreateUser } from './services/firebaseApi';
import { useSearchParams } from "react-router-dom";

function App() {
  const { user, loading, initializeUser } = useAuthStore();
  const { language } = useLanguageStore();
  const [searchParams] = useSearchParams();

  React.useEffect(() => {
    const initUser = async () => {
      const userId = searchParams.get("id");
      const sig = searchParams.get("sig");

      if (userId && sig) {
        // ✅ Ask your backend to verify
        const res = await fetch(`/api/verifyUser?id=${userId}&sig=${sig}`);
        const data = await res.json();

        if (data.valid) {
          const userData = await getOrCreateUser({
            telegramId: userId,
            username: `user_${userId}`,
            language: "en",
          });
          initializeUser(userData);
          return;
        } else {
          console.error("❌ Invalid signature. Possible spoof attempt!");
        }
      }

      // fallback demo user
      const demoUser = await getOrCreateUser({
        telegramId: "demo123",
        username: "demo_user",
        language: "en",
      });
      initializeUser(demoUser);
    };

    initUser();
  }, [initializeUser, searchParams]);


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