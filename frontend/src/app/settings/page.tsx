"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";

export default function SettingsPage() {
  const router = useRouter();
  const { isLoggedIn, isLoading, username, groqApiKey, setGroqKey, logout } = useAuth();

  const [keyInput, setKeyInput] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.replace("/login");
    }
  }, [isLoading, isLoggedIn, router]);

  useEffect(() => {
    if (groqApiKey) setKeyInput(groqApiKey);
  }, [groqApiKey]);

  if (isLoading || !isLoggedIn) return null;

  function handleSave() {
    const key = keyInput.trim();
    if (!key) return;
    setGroqKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="h-screen overflow-y-auto" style={{ background: "var(--bg-deep)" }}>
      <Header />
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>

        {/* Account */}
        <section
          className="mb-6 rounded-xl p-5"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Account
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Logged in as <strong style={{ color: "var(--text-primary)" }}>{username}</strong>
              </p>
            </div>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              Logout
            </button>
          </div>
        </section>

        {/* Groq API Key */}
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Groq API Key
          </h2>
          <p className="mb-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Required for AI-powered features (article structuring, chat).
            Get a free key at{" "}
            <a
              href="https://console.groq.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              console.groq.com
            </a>
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="gsk_..."
              className="flex-1 rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
            <button
              onClick={handleSave}
              disabled={!keyInput.trim() || keyInput.trim() === groqApiKey}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{
                background: saved ? "#16a34a" : "var(--accent)",
              }}
            >
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
