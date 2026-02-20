"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ChatWidget } from "@/components/ChatWidget";
import { BackendStatusBanner } from "@/components/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import type { ReactNode } from "react";

function AppShell({ children }: { children: ReactNode }) {
  const { status: backendStatus, elapsedSeconds, retry: retryBackend } = useBackendStatus();
  const { isLoggedIn } = useAuth();
  const pathname = usePathname();

  const showBanner = isLoggedIn || (pathname !== "/" && pathname !== "/login");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {showBanner && (
        <BackendStatusBanner status={backendStatus} elapsedSeconds={elapsedSeconds} onRetry={retryBackend} />
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {children}
        </div>
        <ChatWidget />
      </div>
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppShell>{children}</AppShell>
      </SettingsProvider>
    </AuthProvider>
  );
}
