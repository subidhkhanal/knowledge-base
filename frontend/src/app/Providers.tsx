"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}
