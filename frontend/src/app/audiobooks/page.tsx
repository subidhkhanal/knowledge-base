"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthFetch } from "@/hooks/useAuthFetch";

interface Audiobook {
  source: string;
  source_type: string;
  chunk_count: number;
  created_at?: string;
}

interface Toast {
  id: string;
  type: "success" | "error" | "loading";
  message: string;
  subMessage?: string;
}

type SortOption = "name" | "date" | "type";
type ViewMode = "grid" | "list";

const AUDIO_FORMAT_CONFIG: Record<string, { icon: JSX.Element; label: string; color: string; bgColor: string }> = {
  mp3: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    label: "MP3",
    color: "text-violet-400",
    bgColor: "from-violet-500/20 to-violet-600/10",
  },
  wav: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    label: "WAV",
    color: "text-blue-400",
    bgColor: "from-blue-500/20 to-blue-600/10",
  },
  m4a: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    label: "M4A",
    color: "text-pink-400",
    bgColor: "from-pink-500/20 to-pink-600/10",
  },
  flac: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    label: "FLAC",
    color: "text-emerald-400",
    bgColor: "from-emerald-500/20 to-emerald-600/10",
  },
  ogg: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    label: "OGG",
    color: "text-orange-400",
    bgColor: "from-orange-500/20 to-orange-600/10",
  },
  webm: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    label: "WebM",
    color: "text-cyan-400",
    bgColor: "from-cyan-500/20 to-cyan-600/10",
  },
};

function getAudioFormat(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ext;
}

function getAudioConfig(filename: string) {
  const ext = getAudioFormat(filename);
  return AUDIO_FORMAT_CONFIG[ext] || {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    label: "Audio",
    color: "text-violet-400",
    bgColor: "from-violet-500/20 to-violet-600/10",
  };
}

function AudiobooksContent() {
  const { user, signIn, signOut } = useAuth();
  const { authFetch } = useAuthFetch();
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setToasts((prev) =>
        prev.filter((t) => {
          if (t.type === "loading") return true;
          const age = Date.now() - parseInt(t.id);
          return age < 4000;
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchAudiobooks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch("/api/sources");
      if (response.ok) {
        const data = await response.json();
        // Filter to only show audio types
        const audioTypes = ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'webm'];
        setAudiobooks(data.filter((s: Audiobook) => {
          const ext = s.source.toLowerCase().split('.').pop() || '';
          return audioTypes.includes(ext) || s.source_type === 'audio';
        }));
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchAudiobooks();
  }, [fetchAudiobooks]);

  const handleDelete = async (sourceName: string) => {
    if (!confirm(`Delete "${sourceName}"?`)) return;

    setDeletingSource(sourceName);

    try {
      const response = await authFetch(`/api/sources/${encodeURIComponent(sourceName)}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchAudiobooks();
        addToast({ type: "success", message: "Audio file deleted" });
      } else {
        const data = await response.json();
        addToast({ type: "error", message: "Failed to delete", subMessage: data.detail });
      }
    } catch {
      addToast({ type: "error", message: "Connection failed" });
    } finally {
      setDeletingSource(null);
    }
  };

  // Get unique audio formats for filter
  const audioFormats = useMemo(() => {
    const formats = new Set(audiobooks.map(ab => getAudioFormat(ab.source)));
    return Array.from(formats).filter(f => AUDIO_FORMAT_CONFIG[f]);
  }, [audiobooks]);

  // Filter and sort audiobooks
  const filteredAudiobooks = useMemo(() => {
    let result = [...audiobooks];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(ab => ab.source.toLowerCase().includes(query));
    }

    // Filter by format
    if (selectedFormat) {
      result = result.filter(ab => getAudioFormat(ab.source) === selectedFormat);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.source.localeCompare(b.source);
        case "type":
          return getAudioFormat(a.source).localeCompare(getAudioFormat(b.source));
        case "date":
        default:
          return (b.created_at || "").localeCompare(a.created_at || "");
      }
    });

    return result;
  }, [audiobooks, searchQuery, sortBy, selectedFormat]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Toast Notifications */}
      <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-fade-in flex items-start gap-3 rounded-2xl px-4 py-3 shadow-2xl backdrop-blur-xl"
            style={{ background: "rgba(30, 30, 35, 0.9)", border: "1px solid rgba(255,255,255,0.1)", minWidth: "300px" }}
          >
            {toast.type === "loading" && (
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
              </div>
            )}
            {toast.type === "success" && (
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                <svg className="h-3 w-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {toast.type === "error" && (
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20">
                <svg className="h-3 w-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{toast.message}</p>
              {toast.subMessage && <p className="text-xs text-zinc-400">{toast.subMessage}</p>}
            </div>
            <button onClick={() => removeToast(toast.id)} className="mt-0.5 text-zinc-500 hover:text-zinc-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: "rgba(10, 10, 12, 0.8)", borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-white">Audio Library</span>
            </Link>
          </div>

          <nav className="flex items-center gap-3">
            {user ? (
              <>
                {user.image && <img src={user.image} alt="" className="h-8 w-8 rounded-full ring-2 ring-zinc-700" />}
                <button onClick={signOut} className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Sign out</button>
              </>
            ) : (
              <button
                onClick={signIn}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-purple-600/5" />
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white md:text-5xl">
              Your Audio Library
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
              All your audio files in one place. Listen, organize, and enjoy your collection.
            </p>
          </div>

          {/* Search Bar */}
          <div className="mx-auto mt-10 max-w-2xl">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search audio files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl py-4 pl-12 pr-4 text-white placeholder-zinc-500 outline-none transition-all focus:ring-2 focus:ring-violet-500/50"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-10 flex max-w-2xl items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{audiobooks.length}</p>
              <p className="text-sm text-zinc-500">Audio Files</p>
            </div>
            <div className="h-8 w-px bg-zinc-700" />
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{audioFormats.length}</p>
              <p className="text-sm text-zinc-500">Formats</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Controls */}
      <div className="sticky top-[73px] z-30 backdrop-blur-xl" style={{ background: "rgba(10, 10, 12, 0.9)", borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          {/* Format Filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedFormat(null)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                !selectedFormat ? "bg-violet-500/20 text-violet-400" : "text-zinc-400 hover:text-white"
              }`}
            >
              All
            </button>
            {audioFormats.map((format) => {
              const config = AUDIO_FORMAT_CONFIG[format];
              return (
                <button
                  key={format}
                  onClick={() => setSelectedFormat(format === selectedFormat ? null : format)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                    selectedFormat === format ? `${config.color} bg-white/10` : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {config.label}
                </button>
              );
            })}
          </div>

          {/* View Controls */}
          <div className="flex items-center gap-4">
            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-zinc-400 outline-none transition-colors hover:text-white"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <option value="date">Recent</option>
              <option value="name">Name</option>
              <option value="type">Format</option>
            </select>

            {/* View Toggle */}
            <div className="flex items-center rounded-lg p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded-md p-1.5 transition-all ${viewMode === "grid" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"}`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`rounded-md p-1.5 transition-all ${viewMode === "list" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-white"}`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="mt-4 text-sm text-zinc-500">Loading your audio library...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
            <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && audiobooks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-6 flex h-32 w-32 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/10 to-purple-500/10">
              <svg className="h-16 w-16 text-violet-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-white">Your audio library is empty</h3>
            <p className="mt-2 text-zinc-500">Upload audio files from the homepage to start building your collection</p>
            <Link
              href="/"
              className="mt-8 flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Audio
            </Link>
          </div>
        )}

        {/* No Results */}
        {!isLoading && !error && audiobooks.length > 0 && filteredAudiobooks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="h-16 w-16 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="mt-4 text-xl font-semibold text-white">No audio files found</h3>
            <p className="mt-2 text-zinc-500">Try adjusting your search or filters</p>
            <button
              onClick={() => { setSearchQuery(""); setSelectedFormat(null); }}
              className="mt-4 text-sm text-violet-400 hover:text-violet-300"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Grid View */}
        {!isLoading && !error && filteredAudiobooks.length > 0 && viewMode === "grid" && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAudiobooks.map((ab, index) => {
              const config = getAudioConfig(ab.source);
              const filename = ab.source.split('/').pop() || ab.source;

              return (
                <div
                  key={ab.source}
                  className="group relative overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.02] animate-fade-in cursor-pointer"
                  style={{
                    background: `linear-gradient(135deg, ${config.bgColor.split(' ')[0].replace('from-', '').replace('/20', ', 0.15)')} 0%, rgba(20, 20, 25, 0.8) 100%)`,
                    border: "1px solid rgba(255,255,255,0.08)",
                    animationDelay: `${index * 0.03}s`,
                  }}
                >
                  {/* Audio Preview Area */}
                  <div className="relative flex h-44 items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.2)" }}>
                    {/* Waveform decoration */}
                    <div className="absolute inset-x-0 bottom-0 flex h-16 items-end justify-center gap-1 px-8 opacity-30">
                      {[...Array(20)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full bg-current"
                          style={{
                            height: `${Math.random() * 100}%`,
                            opacity: 0.5 + Math.random() * 0.5,
                          }}
                        />
                      ))}
                    </div>

                    <div className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${config.bgColor} ${config.color}`}>
                      {config.icon}
                    </div>

                    {/* Hover overlay with actions */}
                    <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500 text-white shadow-lg shadow-violet-500/30 transition-all hover:scale-110 hover:bg-violet-400"
                        title="Play"
                      >
                        <svg className="h-6 w-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(ab.source); }}
                        disabled={deletingSource === ab.source}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 text-red-400 backdrop-blur-sm transition-all hover:bg-red-500/30 disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingSource === ab.source ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                        ) : (
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Audio Info */}
                  <div className="p-4">
                    <h3 className="truncate text-sm font-semibold text-white" title={filename}>
                      {filename}
                    </h3>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${config.color}`} style={{ background: "rgba(255,255,255,0.05)" }}>
                        {config.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {!isLoading && !error && filteredAudiobooks.length > 0 && viewMode === "list" && (
          <div className="space-y-2">
            {filteredAudiobooks.map((ab, index) => {
              const config = getAudioConfig(ab.source);
              const filename = ab.source.split('/').pop() || ab.source;

              return (
                <div
                  key={ab.source}
                  className="group flex items-center gap-4 rounded-xl p-4 transition-all hover:bg-white/5 animate-fade-in cursor-pointer"
                  style={{
                    border: "1px solid rgba(255,255,255,0.05)",
                    animationDelay: `${index * 0.02}s`,
                  }}
                >
                  {/* Play Button */}
                  <button
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-400 transition-all hover:bg-violet-500 hover:text-white"
                    title="Play"
                  >
                    <svg className="h-5 w-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-white" title={filename}>
                      {filename}
                    </h3>
                    <p className="mt-0.5 text-sm text-zinc-500">{config.label}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(ab.source); }}
                      disabled={deletingSource === ab.source}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingSource === ab.source ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function AudiobooksPage() {
  return <AudiobooksContent />;
}
