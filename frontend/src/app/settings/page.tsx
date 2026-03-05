"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings, FONT_FAMILY_OPTIONS, FONT_SIZE_OPTIONS, type FontFamily, type FontSize } from "@/contexts/SettingsContext";
import { Header } from "@/components/Header";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SettingsPage() {
  const router = useRouter();
  const { isLoggedIn, isLoading, username, token, refreshToken, logout } = useAuth();
  const { fontFamily, fontSize, setFontFamily, setFontSize } = useSettings();

  // MCP token state
  const [mcpHasToken, setMcpHasToken] = useState(false);
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpCopied, setMcpCopied] = useState(false);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.replace("/login");
    }
  }, [isLoading, isLoggedIn, router]);

  // Fetch MCP token status on mount
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/auth/mcp-token/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setMcpHasToken(d.has_token))
      .catch(() => {});
  }, [token]);

  if (isLoading || !isLoggedIn) return null;

  async function handleGenerateMcpToken() {
    setMcpLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/mcp-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMcpToken(data.mcp_token);
      setMcpHasToken(true);
    } catch {
      // silently fail
    } finally {
      setMcpLoading(false);
    }
  }

  async function handleRevokeMcpToken() {
    setMcpLoading(true);
    try {
      await fetch(`${API_URL}/api/auth/mcp-token`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setMcpHasToken(false);
      setMcpToken(null);
    } catch {
      // silently fail
    } finally {
      setMcpLoading(false);
    }
  }

  function copyMcpToken() {
    if (!mcpToken) return;
    navigator.clipboard.writeText(`${API_URL}/mcp?token=${mcpToken}`);
    setMcpCopied(true);
    setTimeout(() => setMcpCopied(false), 2000);
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
              onClick={async () => {
                if (refreshToken) {
                  await fetch(`${API_URL}/api/auth/logout`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                  }).catch(() => {});
                }
                logout();
                router.replace("/login");
              }}
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

        {/* Reading Preferences */}
        <section
          className="mb-6 rounded-xl p-5"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Reading Preferences
          </h2>

          {/* Font Family */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Font Family
            </label>
            <div className="grid gap-2">
              {(Object.entries(FONT_FAMILY_OPTIONS) as [FontFamily, { label: string; css: string }][]).map(
                ([key, { label, css }]) => (
                  <button
                    key={key}
                    onClick={() => setFontFamily(key)}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm cursor-pointer"
                    style={{
                      background: fontFamily === key ? "var(--accent-subtle)" : "var(--bg-secondary)",
                      border: fontFamily === key ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                      color: "var(--text-primary)",
                      fontFamily: css,
                    }}
                  >
                    <span>{label}</span>
                    {fontFamily === key && (
                      <svg className="h-4 w-4" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="mb-2 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Font Size
            </label>
            <div className="flex gap-2">
              {(Object.entries(FONT_SIZE_OPTIONS) as [FontSize, { label: string; px: string }][]).map(
                ([key, { label }]) => (
                  <button
                    key={key}
                    onClick={() => setFontSize(key)}
                    className="flex-1 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer"
                    style={{
                      background: fontSize === key ? "var(--accent-subtle)" : "var(--bg-secondary)",
                      border: fontSize === key ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                      color: fontSize === key ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Live Preview */}
          <div className="mt-4 rounded-lg p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>Preview</p>
            <p style={{
              fontFamily: FONT_FAMILY_OPTIONS[fontFamily].css,
              fontSize: FONT_SIZE_OPTIONS[fontSize].px,
              lineHeight: "1.75",
              color: "var(--text-primary)",
            }}>
              The quick brown fox jumps over the lazy dog. Reading content will appear in this font and size across articles, chat messages, and documents.
            </p>
          </div>
        </section>

        {/* MCP Access Token */}
        <section
          className="mb-6 rounded-xl p-5"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            MCP Access Token
          </h2>
          <p className="mb-4 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Connect AI clients (Claude.ai, Cursor, etc.) to your knowledge base via MCP.
            The token is shown only once when generated.
          </p>

          {/* Just generated — show MCP URL */}
          {mcpToken && (
            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Your MCP server URL (copy now — token won{"'"}t be shown again):
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  readOnly
                  value={`${API_URL}/mcp?token=${mcpToken}`}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-mono"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  onClick={copyMcpToken}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-white cursor-pointer"
                  style={{ background: mcpCopied ? "#16a34a" : "var(--accent)" }}
                >
                  {mcpCopied ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Setup instructions */}
              <div
                className="mt-3 rounded-lg p-3 text-xs"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-tertiary)",
                }}
              >
                <p className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>How to connect:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>Claude.ai</strong>: Settings &gt; Connectors &gt; Add custom connector &gt; paste URL</li>
                  <li><strong>Cursor</strong>: Settings &gt; MCP &gt; Add server &gt; paste URL</li>
                  <li><strong>Any MCP client</strong>: Use this URL as the server endpoint</li>
                </ul>
              </div>
            </div>
          )}

          {/* No token yet */}
          {!mcpHasToken && !mcpToken && (
            <button
              onClick={handleGenerateMcpToken}
              disabled={mcpLoading}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {mcpLoading ? "Generating..." : "Generate Token"}
            </button>
          )}

          {/* Has token already (not just generated) */}
          {mcpHasToken && !mcpToken && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: "#16a34a" }}
                />
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Token active
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateMcpToken}
                  disabled={mcpLoading}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {mcpLoading ? "..." : "Regenerate"}
                </button>
                <button
                  onClick={handleRevokeMcpToken}
                  disabled={mcpLoading}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--error, #ef4444)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Revoke
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
