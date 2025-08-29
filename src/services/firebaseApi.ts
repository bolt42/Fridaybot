import { rtdb } from "../firebase/config";
import { ref, get, set } from "firebase/database";

export async function getOrCreateUser(user: {
  telegramId: string;
  username: string;
  language: string;
}) {
  const userRef = ref(rtdb, `users/${user.telegramId}`);
  const snapshot = await get(userRef);

  if (snapshot.exists()) {
    return snapshot.val(); // existing user
  }

  // if not found → create new
  const newUser = {
    ...user,
    balance: 50,
    createdAt: Date.now(),
  };
  await set(userRef, newUser);
  return newUser;
}
