"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings, FONT_FAMILY_OPTIONS, FONT_SIZE_OPTIONS, type FontFamily, type FontSize } from "@/contexts/SettingsContext";
import { Header } from "@/components/Header";

interface TavilyUsageData {
  total_usage: number;
  limit: number | null;
  plan: string;
  search_usage: number;
  extract_usage: number;
}

function parseTavilyResponse(data: Record<string, unknown>): TavilyUsageData {
  // Tavily API returns nested structure: { key: { usage, limit, ... }, account: { current_plan, ... } }
  // or flat structure depending on version. Handle both.
  const key = data.key as Record<string, unknown> | undefined;
  const account = data.account as Record<string, unknown> | undefined;

  if (key) {
    return {
      total_usage: (key.usage as number) ?? 0,
      limit: (key.limit as number | null) ?? null,
      plan: (account?.current_plan as string) ?? "Unknown",
      search_usage: (key.search_usage as number) ?? 0,
      extract_usage: (key.extract_usage as number) ?? 0,
    };
  }

  // Flat structure fallback
  return {
    total_usage: (data.usage as number) ?? 0,
    limit: (data.limit as number | null) ?? null,
    plan: (data.current_plan as string) ?? "Unknown",
    search_usage: (data.search_usage as number) ?? 0,
    extract_usage: (data.extract_usage as number) ?? 0,
  };
}

function TavilyUsageDisplay({ apiKey }: { apiKey: string }) {
  const [usage, setUsage] = useState<TavilyUsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("https://api.tavily.com/usage", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error("Failed to fetch usage");
      const data = await res.json();
      setUsage(parseTavilyResponse(data));
    } catch {
      setError("Could not load usage data");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading usage...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{error}</p>
        <button onClick={fetchUsage} className="text-xs cursor-pointer" style={{ color: "var(--accent)" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!usage) return null;

  const effectiveLimit = (usage.limit !== null && usage.limit > 0) ? usage.limit : 1000;
  const usagePercent = Math.round((usage.total_usage / effectiveLimit) * 100);

  return (
    <div className="mt-3 rounded-lg p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Monthly Usage
        </span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {usage.plan} plan
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full mb-2" style={{ background: "var(--bg-tertiary)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(usagePercent, 100)}%`,
            background: usagePercent > 80 ? "var(--error)" : "var(--accent)",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
        <span>
          {usage.total_usage.toLocaleString()} / {effectiveLimit.toLocaleString()} credits
        </span>
        <span>{usagePercent}%</span>
      </div>

      <div className="mt-2 flex gap-4 text-xs" style={{ color: "var(--text-tertiary)" }}>
        <span>Searches: {usage.search_usage.toLocaleString()}</span>
        <span>Extracts: {usage.extract_usage.toLocaleString()}</span>
      </div>
    </div>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SettingsPage() {
  const router = useRouter();
  const { isLoggedIn, isLoading, username, token, groqApiKey, setGroqKey, tavilyApiKey, setTavilyKey, logout } = useAuth();
  const { fontFamily, fontSize, setFontFamily, setFontSize } = useSettings();

  const [keyInput, setKeyInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [tavilyInput, setTavilyInput] = useState("");
  const [tavilySaved, setTavilySaved] = useState(false);

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

  useEffect(() => {
    if (groqApiKey) setKeyInput(groqApiKey);
  }, [groqApiKey]);

  useEffect(() => {
    if (tavilyApiKey) setTavilyInput(tavilyApiKey);
  }, [tavilyApiKey]);

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

  function handleSave() {
    const key = keyInput.trim();
    if (!key) return;
    setGroqKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleTavilySave() {
    const key = tavilyInput.trim();
    if (!key) return;
    setTavilyKey(key);
    setTavilySaved(true);
    setTimeout(() => setTavilySaved(false), 2000);
  }

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

        {/* API Keys & Usage */}
        <section
          className="mb-6 rounded-xl p-5"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            API Keys
          </h2>

          {/* Groq API Key */}
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              Groq API Key
            </h3>
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
            <div className="mt-3 flex items-center gap-2">
              <svg className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <a
                href="https://console.groq.com/settings/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs"
                style={{ color: "var(--accent)" }}
              >
                View usage on Groq Console
              </a>
            </div>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} className="mb-5" />

          {/* Tavily API Key */}
          <div>
            <h3 className="mb-2 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              Tavily API Key
            </h3>
            <p className="mb-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Required for Deep Research (web search). Get a free key at{" "}
              <a
                href="https://tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
              >
                tavily.com
              </a>
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={tavilyInput}
                onChange={(e) => setTavilyInput(e.target.value)}
                placeholder="tvly-..."
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                onClick={handleTavilySave}
                disabled={!tavilyInput.trim() || tavilyInput.trim() === tavilyApiKey}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-50"
                style={{
                  background: tavilySaved ? "#16a34a" : "var(--accent)",
                }}
              >
                {tavilySaved ? "Saved!" : "Save"}
              </button>
            </div>
            {tavilyApiKey && <TavilyUsageDisplay apiKey={tavilyApiKey} />}
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
