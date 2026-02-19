"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BackendStatus } from "@/hooks/useBackendStatus";

interface BackendStatusBannerProps {
  status: BackendStatus;
  elapsedSeconds: number;
  onRetry: () => void;
}

export function BackendStatusBanner({ status, elapsedSeconds, onRetry }: BackendStatusBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (status === "online") {
      const timer = setTimeout(() => setDismissed(true), 3000);
      return () => clearTimeout(timer);
    }
    setDismissed(false);
  }, [status]);

  const shouldShow = status !== "checking" && !dismissed;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -20, height: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="backend-status-banner"
        >
          <div className="mx-auto max-w-3xl px-6 py-3">
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background:
                  status === "offline"
                    ? "var(--error-bg)"
                    : status === "online"
                    ? "var(--success-bg)"
                    : "var(--accent-subtle)",
                border: `1px solid ${
                  status === "offline"
                    ? "rgba(220, 38, 38, 0.2)"
                    : status === "online"
                    ? "rgba(22, 163, 74, 0.2)"
                    : "var(--border-accent)"
                }`,
              }}
            >
              {/* Status icon */}
              {status === "waking" && (
                <svg
                  className="h-5 w-5 animate-spin"
                  style={{ color: "var(--accent)" }}
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {status === "online" && (
                <svg className="h-5 w-5" style={{ color: "var(--success)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {status === "offline" && (
                <svg className="h-5 w-5" style={{ color: "var(--error)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}

              {/* Text content */}
              <div className="flex-1 min-w-0">
                {status === "waking" && (
                  <>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      Waking up the server...
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      Free tier servers sleep after inactivity. This usually takes 30–60 seconds ({elapsedSeconds}s)
                    </p>
                  </>
                )}
                {status === "online" && (
                  <p className="text-sm font-medium" style={{ color: "var(--success)" }}>
                    Server is ready!
                  </p>
                )}
                {status === "offline" && (
                  <>
                    <p className="text-sm font-medium" style={{ color: "var(--error)" }}>
                      Could not reach the server
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      The backend may be down or experiencing issues
                    </p>
                  </>
                )}
              </div>

              {/* Retry button */}
              {status === "offline" && (
                <button
                  onClick={onRetry}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
