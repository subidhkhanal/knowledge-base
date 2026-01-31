"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  id: string;
  name: string;
  email?: string;
  image?: string;
}

interface AuthContextType {
  user: User | null;
  status: "loading" | "authenticated" | "unauthenticated";
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "pkb_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  useEffect(() => {
    // Check for stored user on mount
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
      }
    } catch {
      setStatus("unauthenticated");
    }
  }, []);

  const signIn = () => {
    // For now, create a local anonymous user
    // Replace this with actual GitHub OAuth implementation
    const anonymousUser: User = {
      id: `local_${Date.now()}`,
      name: "Local User",
    };
    setUser(anonymousUser);
    setStatus("authenticated");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(anonymousUser));
  };

  const signOut = () => {
    setUser(null);
    setStatus("unauthenticated");
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, status, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Compatibility shim for next-auth imports
export function useSession() {
  const { user, status } = useAuth();
  return {
    data: user ? {
      user: {
        name: user.name,
        email: user.email,
        image: user.image,
      },
      userId: user.id,
    } : null,
    status,
  };
}

export function signIn() {
  // This will be called from components
  // The actual signIn comes from the context
}

export function signOut() {
  // This will be called from components
  // The actual signOut comes from the context
}
