"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface AuthState {
  token: string | null;
  username: string | null;
  groqApiKey: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (token: string, username: string) => void;
  logout: () => void;
  setGroqKey: (key: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEYS = {
  token: "kb_auth_token",
  username: "kb_username",
  groqKey: "kb_groq_key",
} as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [groqApiKey, setGroqApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    setToken(localStorage.getItem(STORAGE_KEYS.token));
    setUsername(localStorage.getItem(STORAGE_KEYS.username));
    setGroqApiKey(localStorage.getItem(STORAGE_KEYS.groqKey));
    setIsLoading(false);
  }, []);

  const login = useCallback((newToken: string, newUsername: string) => {
    localStorage.setItem(STORAGE_KEYS.token, newToken);
    localStorage.setItem(STORAGE_KEYS.username, newUsername);
    setToken(newToken);
    setUsername(newUsername);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.username);
    localStorage.removeItem(STORAGE_KEYS.groqKey);
    setToken(null);
    setUsername(null);
    setGroqApiKey(null);
  }, []);

  const setGroqKey = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEYS.groqKey, key);
    setGroqApiKey(key);
  }, []);

  return (
    <AuthContext value={{
      token,
      username,
      groqApiKey,
      isLoggedIn: !!token,
      isLoading,
      login,
      logout,
      setGroqKey,
    }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
