import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const UserPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [tgUserId, setTgUserId] = useState<string | null>(null);
  const [urlUserId, setUrlUserId] = useState<string | null>(null);

  useEffect(() => {
    // Get user id from URL
    const id = searchParams.get('id');
    setUrlUserId(id);

    // Get Telegram user id from WebApp context
    let tgId: string | null = null;
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user) {
      tgId = window.Telegram.WebApp.initDataUnsafe.user.id?.toString();
      setTgUserId(tgId);
    }

    // Compare
    if (!id || !tgId) {
      setError('User ID missing or not running inside Telegram WebApp.');
    } else if (id !== tgId) {
      setError('Access denied: Telegram user does not match URL.');
    }
  }, [searchParams]);

  if (error) {
    return <div className="text-red-500 text-center mt-10">{error}</div>;
  }

  return (
    <div className="text-green-500 text-center mt-10">
      Welcome, Telegram user #{tgUserId}!
      {/* Place your secure user content here */}
    </div>
  );
};

export default UserPage;
