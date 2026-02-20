"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBackendStatus } from "@/hooks/useBackendStatus";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoggedIn } = useAuth();
  const { status: backendStatus, retry } = useBackendStatus();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  if (isLoggedIn) {
    router.replace("/");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError("Enter username and password");
      return;
    }

    setIsSubmitting(true);

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

    try {
      const resp = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        let detail: string;
        if (typeof err.detail === "string") {
          detail = err.detail;
        } else if (Array.isArray(err.detail)) {
          detail = err.detail.map((e: { msg?: string }) => {
            const msg = e.msg || "Validation error";
            return msg.replace(/^Value error, /i, "");
          }).join(". ");
        } else {
          detail = `HTTP ${resp.status}`;
        }
        throw new Error(detail);
      }

      const data = await resp.json();
      login(data.access_token, data.username || username.trim());
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--bg-deep)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{
          background: "var(--bg-primary)",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, #0284c7 100%)",
            }}
          >
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Personal Knowledge Base
          </h1>
        </div>

        {backendStatus === "waking" || backendStatus === "offline" ? (
          <div className="flex flex-col items-center gap-4 py-6">
            {backendStatus === "waking" && (
              <>
                <svg
                  className="h-8 w-8 animate-spin"
                  style={{ color: "var(--accent)" }}
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Connecting to server...
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    The server is waking up, this may take a moment
                  </p>
                </div>
              </>
            )}
            {backendStatus === "offline" && (
              <>
                <svg className="h-8 w-8" style={{ color: "var(--error)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: "var(--error)" }}>
                    Could not reach the server
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    The backend may be down or experiencing issues
                  </p>
                </div>
                <button
                  onClick={retry}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white cursor-pointer"
                  style={{ background: "var(--accent)" }}
                >
                  Retry
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mb-5 flex gap-1 rounded-lg p-1" style={{ background: "var(--bg-secondary)" }}>
              {(["login", "register"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setMode(tab); setError(null); }}
                  className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer"
                  style={{
                    background: mode === tab ? "var(--bg-primary)" : "transparent",
                    color: mode === tab ? "var(--text-primary)" : "var(--text-secondary)",
                    boxShadow: mode === tab ? "var(--shadow-card)" : "none",
                  }}
                >
                  {tab === "login" ? "Login" : "Register"}
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div
                className="mb-4 rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--error-bg)", color: "var(--error)" }}
              >
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your username"
                  autoComplete="username"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white cursor-pointer disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, var(--accent) 0%, #0284c7 100%)",
                }}
              >
                {isSubmitting
                  ? mode === "login" ? "Logging in..." : "Registering..."
                  : mode === "login" ? "Login" : "Register"
                }
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
