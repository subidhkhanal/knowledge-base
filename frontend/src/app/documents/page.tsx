"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthFetch } from "@/hooks/useAuthFetch";

interface Document {
  source: string;
  source_type: string;
  chunk_count: number;
  created_at?: string;
}

interface DocumentChunk {
  text: string;
  chunk_index: number;
  total_chunks: number;
  page?: number;
  source_type: string;
}

interface DocumentContent {
  source: string;
  total_chunks: number;
  chunks: DocumentChunk[];
}

interface Toast {
  id: string;
  type: "success" | "error" | "loading";
  message: string;
  subMessage?: string;
}

type SortOption = "name" | "date" | "type";
type ViewMode = "grid" | "list";

const FILE_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bgColor: string }> = {
  pdf: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        <text x="7" y="16" fontSize="6" fill="currentColor" fontWeight="bold">PDF</text>
      </svg>
    ),
    label: "PDF",
    color: "text-red-400",
    bgColor: "from-red-500/20 to-red-600/10",
  },
  epub: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    label: "EPUB",
    color: "text-emerald-400",
    bgColor: "from-emerald-500/20 to-emerald-600/10",
  },
  docx: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    label: "Word",
    color: "text-blue-400",
    bgColor: "from-blue-500/20 to-blue-600/10",
  },
  doc: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    label: "Word",
    color: "text-blue-400",
    bgColor: "from-blue-500/20 to-blue-600/10",
  },
  html: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    label: "HTML",
    color: "text-orange-400",
    bgColor: "from-orange-500/20 to-orange-600/10",
  },
  txt: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
    label: "Text",
    color: "text-zinc-400",
    bgColor: "from-zinc-500/20 to-zinc-600/10",
  },
  md: {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
    label: "Markdown",
    color: "text-purple-400",
    bgColor: "from-purple-500/20 to-purple-600/10",
  },
};

function getFileType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ext;
}

function getFileConfig(filename: string) {
  const ext = getFileType(filename);
  return FILE_TYPE_CONFIG[ext] || {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    label: "Document",
    color: "text-zinc-400",
    bgColor: "from-zinc-500/20 to-zinc-600/10",
  };
}

function DocumentsContent() {
  const { user, signIn, signOut } = useAuth();
  const { authFetch } = useAuthFetch();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerContent, setViewerContent] = useState<DocumentContent | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

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

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch("/api/sources");
      if (response.ok) {
        const data = await response.json();
        // Filter to only show document types (not audio)
        const docTypes = ['pdf', 'epub', 'docx', 'doc', 'html', 'htm', 'txt', 'md', 'markdown'];
        setDocuments(data.filter((s: Document) => {
          const ext = s.source.toLowerCase().split('.').pop() || '';
          return docTypes.includes(ext) || s.source_type === 'pdf';
        }));
      }
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDelete = async (sourceName: string) => {
    if (!confirm(`Delete "${sourceName}"?`)) return;

    setDeletingSource(sourceName);

    try {
      const response = await authFetch(`/api/sources/${encodeURIComponent(sourceName)}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchDocuments();
        addToast({ type: "success", message: "Document deleted" });
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

  const openDocument = async (sourceName: string) => {
    setViewerOpen(true);
    setViewerLoading(true);
    setViewerContent(null);

    try {
      const response = await authFetch(`/api/sources/${encodeURIComponent(sourceName)}/content`);
      if (response.ok) {
        const data = await response.json();
        setViewerContent(data);
      } else {
        addToast({ type: "error", message: "Failed to load document" });
        setViewerOpen(false);
      }
    } catch {
      addToast({ type: "error", message: "Connection failed" });
      setViewerOpen(false);
    } finally {
      setViewerLoading(false);
    }
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerContent(null);
  };

  // Get unique document types for filter
  const documentTypes = useMemo(() => {
    const types = new Set(documents.map(doc => getFileType(doc.source)));
    return Array.from(types).filter(t => FILE_TYPE_CONFIG[t]);
  }, [documents]);

  // Filter and sort documents
  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(doc => doc.source.toLowerCase().includes(query));
    }

    // Filter by type
    if (selectedType) {
      result = result.filter(doc => getFileType(doc.source) === selectedType);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.source.localeCompare(b.source);
        case "type":
          return getFileType(a.source).localeCompare(getFileType(b.source));
        case "date":
        default:
          return (b.created_at || "").localeCompare(a.created_at || "");
      }
    });

    return result;
  }, [documents, searchQuery, sortBy, selectedType]);

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
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
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

      {/* Document Viewer Modal */}
      {viewerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={closeViewer}
          />

          {/* Modal */}
          <div
            className="relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3">
                {viewerContent && (
                  <>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${getFileConfig(viewerContent.source).bgColor} ${getFileConfig(viewerContent.source).color}`}>
                      {getFileConfig(viewerContent.source).icon}
                    </div>
                    <div>
                      <h2 className="font-semibold text-white">{viewerContent.source.split('/').pop()}</h2>
                      <p className="text-xs text-zinc-500">{viewerContent.total_chunks} sections</p>
                    </div>
                  </>
                )}
                {viewerLoading && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-zinc-800" />
                    <div>
                      <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
                      <div className="mt-1 h-3 w-20 animate-pulse rounded bg-zinc-800" />
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={closeViewer}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {viewerLoading && (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  <p className="mt-4 text-sm text-zinc-500">Loading document...</p>
                </div>
              )}

              {viewerContent && (
                <div className="prose prose-invert max-w-none">
                  {viewerContent.chunks.map((chunk, index) => (
                    <div key={index} className="mb-6">
                      {chunk.page && (
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                            Page {chunk.page}
                          </span>
                        </div>
                      )}
                      <div
                        className="whitespace-pre-wrap rounded-xl p-4 text-sm leading-relaxed text-zinc-300"
                        style={{ background: "rgba(255,255,255,0.03)" }}
                      >
                        {chunk.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: "rgba(10, 10, 12, 0.8)", borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-white">My Library</span>
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
        <div className="absolute inset-0 bg-gradient-to-br from-amber-600/10 via-transparent to-orange-600/5" />
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white md:text-5xl">
              Your Document Library
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
              All your documents in one place. Read, organize, and access your files anytime.
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
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl py-4 pl-12 pr-4 text-white placeholder-zinc-500 outline-none transition-all focus:ring-2 focus:ring-amber-500/50"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-10 flex max-w-2xl items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{documents.length}</p>
              <p className="text-sm text-zinc-500">Documents</p>
            </div>
            <div className="h-8 w-px bg-zinc-700" />
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{documentTypes.length}</p>
              <p className="text-sm text-zinc-500">Formats</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Controls */}
      <div className="sticky top-[73px] z-30 backdrop-blur-xl" style={{ background: "rgba(10, 10, 12, 0.9)", borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          {/* Type Filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedType(null)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                !selectedType ? "bg-amber-500/20 text-amber-400" : "text-zinc-400 hover:text-white"
              }`}
            >
              All
            </button>
            {documentTypes.map((type) => {
              const config = FILE_TYPE_CONFIG[type];
              return (
                <button
                  key={type}
                  onClick={() => setSelectedType(type === selectedType ? null : type)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                    selectedType === type ? `${config.color} bg-white/10` : "text-zinc-400 hover:text-white"
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
              <option value="type">Type</option>
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
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <p className="mt-4 text-sm text-zinc-500">Loading your library...</p>
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
        {!isLoading && !error && documents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-6 flex h-32 w-32 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-500/10 to-orange-500/10">
              <svg className="h-16 w-16 text-amber-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-white">Your library is empty</h3>
            <p className="mt-2 text-zinc-500">Upload documents from the homepage to start building your library</p>
            <Link
              href="/"
              className="mt-8 flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Documents
            </Link>
          </div>
        )}

        {/* No Results */}
        {!isLoading && !error && documents.length > 0 && filteredDocuments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="h-16 w-16 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="mt-4 text-xl font-semibold text-white">No documents found</h3>
            <p className="mt-2 text-zinc-500">Try adjusting your search or filters</p>
            <button
              onClick={() => { setSearchQuery(""); setSelectedType(null); }}
              className="mt-4 text-sm text-amber-400 hover:text-amber-300"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Grid View */}
        {!isLoading && !error && filteredDocuments.length > 0 && viewMode === "grid" && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredDocuments.map((doc, index) => {
              const config = getFileConfig(doc.source);
              const filename = doc.source.split('/').pop() || doc.source;

              return (
                <div
                  key={doc.source}
                  onClick={() => openDocument(doc.source)}
                  className="group relative overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.02] animate-fade-in cursor-pointer"
                  style={{
                    background: `linear-gradient(135deg, ${config.bgColor.split(' ')[0].replace('from-', '').replace('/20', ', 0.15)')} 0%, rgba(20, 20, 25, 0.8) 100%)`,
                    border: "1px solid rgba(255,255,255,0.08)",
                    animationDelay: `${index * 0.03}s`,
                  }}
                >
                  {/* Document Preview Area */}
                  <div className="relative flex h-44 items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.2)" }}>
                    <div className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${config.bgColor} ${config.color}`}>
                      {config.icon}
                    </div>

                    {/* Hover overlay with actions */}
                    <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); openDocument(doc.source); }}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all hover:bg-white/20"
                        title="Open"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(doc.source); }}
                        disabled={deletingSource === doc.source}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 text-red-400 backdrop-blur-sm transition-all hover:bg-red-500/30 disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingSource === doc.source ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                        ) : (
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Document Info */}
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
        {!isLoading && !error && filteredDocuments.length > 0 && viewMode === "list" && (
          <div className="space-y-2">
            {filteredDocuments.map((doc, index) => {
              const config = getFileConfig(doc.source);
              const filename = doc.source.split('/').pop() || doc.source;

              return (
                <div
                  key={doc.source}
                  onClick={() => openDocument(doc.source)}
                  className="group flex items-center gap-4 rounded-xl p-4 transition-all hover:bg-white/5 animate-fade-in cursor-pointer"
                  style={{
                    border: "1px solid rgba(255,255,255,0.05)",
                    animationDelay: `${index * 0.02}s`,
                  }}
                >
                  {/* Icon */}
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${config.bgColor} ${config.color}`}>
                    {config.icon}
                  </div>

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
                      onClick={(e) => { e.stopPropagation(); openDocument(doc.source); }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                      title="Open"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.source); }}
                      disabled={deletingSource === doc.source}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingSource === doc.source ? (
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

export default function DocumentsPage() {
  return <DocumentsContent />;
}
