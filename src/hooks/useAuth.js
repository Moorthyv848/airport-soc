import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../services/firebase";

export function useAuth() {
  const [user, setUser] = useState(null);

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    setUser(cred.user);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return { user, login, logout };
}
