"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { useAuthFetch } from "@/hooks/useAuthFetch";

interface Source {
  source: string;
  source_type: string;
  chunk_count: number;
}

interface Stats {
  total_sources: number;
  total_chunks: number;
  whisper_available: boolean;
}

function SourcesContent() {
  const { data: session } = useSession();
  const { authFetch } = useAuthFetch();
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sourcesRes, statsRes] = await Promise.all([
        authFetch("/api/sources"),
        authFetch("/api/stats"),
      ]);

      if (sourcesRes.ok) {
        const sourcesData = await sourcesRes.json();
        setSources(sourcesData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (sourceName: string) => {
    if (!confirm(`Delete "${sourceName}"?`)) return;

    setDeletingSource(sourceName);

    try {
      const response = await authFetch(
        `/api/sources/${encodeURIComponent(sourceName)}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        await fetchData();
      } else {
        const data = await response.json();
        alert(data.detail || "Failed to delete");
      }
    } catch {
      alert("Failed to connect");
    } finally {
      setDeletingSource(null);
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "pdf":
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case "audio":
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <Link href="/" className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
          Knowledge Base
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Chat
          </Link>
          <Link href="/upload" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium" style={{ color: 'var(--accent)' }}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
            Upload
          </Link>
          <div className="ml-2 flex items-center gap-2 border-l pl-4" style={{ borderColor: 'var(--border)' }}>
            {session ? (
              <>
                {session.user?.image && <img src={session.user.image} alt="" className="h-7 w-7 rounded-full" />}
                <button onClick={() => signOut()} className="text-xs px-2 py-1 rounded transition-colors" style={{ color: 'var(--text-tertiary)' }}>Sign out</button>
              </>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in
              </button>
            )}
          </div>
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium" style={{ color: 'var(--text-primary)' }}>Sources</h1>
            {stats && (
              <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {stats.total_sources} sources · {stats.total_chunks} chunks
              </p>
            )}
          </div>
          <button
            onClick={fetchData}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <svg
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
              style={{ color: 'var(--text-secondary)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <svg className="h-6 w-6 animate-spin" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'var(--error-bg)' }}>
            <svg className="h-5 w-5" style={{ color: 'var(--error)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
          </div>
        )}

        {/* Sources List */}
        {!isLoading && !error && (
          <>
            {sources.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center rounded-xl py-16 text-center"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'var(--accent-subtle)' }}>
                  <svg className="h-6 w-6" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="mb-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No sources yet</p>
                <p className="mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>Upload content to get started</p>
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Upload
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((source, index) => (
                  <div
                    key={source.source}
                    className="group flex items-center justify-between rounded-xl px-4 py-3 transition-colors animate-fade-in"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', animationDelay: `${index * 0.03}s` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                        {getSourceIcon(source.source_type)}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{source.source}</p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{source.chunk_count} chunks</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(source.source)}
                      disabled={deletingSource === source.source}
                      className="flex h-8 w-8 items-center justify-center rounded-lg opacity-0 transition-all group-hover:opacity-100 disabled:opacity-50"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {deletingSource === source.source ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function SourcesPage() {
  return <SourcesContent />;
}
