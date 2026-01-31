"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { useAuthFetch } from "@/hooks/useAuthFetch";

interface Audiobook {
  source: string;
  source_type: string;
  chunk_count: number;
}

interface Toast {
  id: string;
  type: "success" | "error" | "loading";
  message: string;
  subMessage?: string;
}

interface UploadState {
  isUploading: boolean;
  progress: number;
  fileName: string;
}

function AudiobooksContent() {
  const { data: session } = useSession();
  const { authFetch, createAuthXhr } = useAuthFetch();
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    fileName: "",
  });
  const [isDragging, setIsDragging] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const updateToast = (id: string, updates: Partial<Toast>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
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
        setAudiobooks(data.filter((s: Audiobook) => s.source_type === "audio"));
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
        addToast({ type: "success", message: "Audiobook deleted" });
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

  const handleFileUpload = async (file: File) => {
    setShowUploadModal(false);
    const toastId = addToast({
      type: "loading",
      message: `Uploading ${file.name}`,
      subMessage: "0%",
    });

    setUploadState({ isUploading: true, progress: 0, fileName: file.name });

    const formData = new FormData();
    formData.append("file", file);

    const xhr = createAuthXhr("POST", "/api/upload/audio");
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadState((prev) => ({ ...prev, progress: percent }));
        updateToast(toastId, { subMessage: `${percent}%` });
      }
    });

    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          removeToast(toastId);
          addToast({
            type: "success",
            message: "Upload complete",
            subMessage: `${data.chunks_created} chunks created`,
          });
          fetchAudiobooks();
        } else {
          removeToast(toastId);
          addToast({ type: "error", message: "Upload failed", subMessage: data.detail });
        }
      } catch {
        removeToast(toastId);
        addToast({ type: "error", message: "Upload failed" });
      }
      setUploadState({ isUploading: false, progress: 0, fileName: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.addEventListener("error", () => {
      removeToast(toastId);
      addToast({ type: "error", message: "Connection failed" });
      setUploadState({ isUploading: false, progress: 0, fileName: "" });
    });

    xhr.addEventListener("abort", () => {
      removeToast(toastId);
      addToast({ type: "error", message: "Upload cancelled" });
      setUploadState({ isUploading: false, progress: 0, fileName: "" });
    });

    xhr.send(formData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const totalChunks = audiobooks.reduce((acc, ab) => acc + ab.chunk_count, 0);

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
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
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

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowUploadModal(false)}>
          <div
            className="animate-fade-in w-full max-w-md rounded-3xl p-8"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                <svg className="h-8 w-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white">Upload Audiobook</h3>
              <p className="mt-1 text-sm text-zinc-400">Add audio to your knowledge base</p>
            </div>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all"
              style={{
                borderColor: isDragging ? "#a855f7" : "var(--border)",
                background: isDragging ? "rgba(168, 85, 247, 0.1)" : "var(--bg-tertiary)",
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <svg className="mb-3 h-10 w-10 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-sm font-medium text-white">Drop audio file here</p>
              <p className="text-xs text-zinc-500">MP3, WAV, M4A, FLAC, OGG, WebM</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,.flac,.ogg,.webm" onChange={handleFileChange} className="hidden" />
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <Link href="/" className="text-lg font-medium text-white">Knowledge Base</Link>
        <nav className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Chat
          </Link>
          <div className="ml-2 flex items-center gap-3 border-l border-zinc-800 pl-4">
            {session?.user?.image && <img src={session.user.image} alt="" className="h-7 w-7 rounded-full ring-2 ring-zinc-700" />}
            <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs text-zinc-500 hover:text-zinc-300">Sign out</button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-transparent to-pink-600/10" />
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-pink-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-6 py-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25">
                <svg className="h-10 w-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Audiobooks</h1>
                <p className="mt-1 text-zinc-400">Your audio library</p>
              </div>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              disabled={uploadState.isUploading}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:shadow-xl hover:shadow-purple-500/30 disabled:opacity-50"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Audiobook
            </button>
          </div>

          {/* Stats */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                  <svg className="h-5 w-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{audiobooks.length}</p>
                  <p className="text-xs text-zinc-500">Audiobooks</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10">
                  <svg className="h-5 w-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{totalChunks}</p>
                  <p className="text-xs text-zinc-500">Total Chunks</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                  <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">Ready</p>
                  <p className="text-xs text-zinc-500">Status</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Progress */}
      {uploadState.isUploading && (
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-2xl p-4" style={{ background: "rgba(168, 85, 247, 0.1)", border: "1px solid rgba(168, 85, 247, 0.2)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-purple-500/20" />
                <div>
                  <p className="text-sm font-medium text-white">{uploadState.fileName}</p>
                  <p className="text-xs text-purple-400">Uploading... {uploadState.progress}%</p>
                </div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-purple-500/20">
              <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300" style={{ width: `${uploadState.progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            <p className="mt-4 text-sm text-zinc-500">Loading audiobooks...</p>
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
          <div className="flex flex-col items-center justify-center rounded-3xl py-20" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-purple-500/10 to-pink-500/10">
              <svg className="h-12 w-12 text-purple-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white">No audiobooks yet</h3>
            <p className="mt-2 text-sm text-zinc-500">Upload your first audio file to get started</p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload Audiobook
            </button>
          </div>
        )}

        {/* Audiobooks Grid */}
        {!isLoading && !error && audiobooks.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {audiobooks.map((ab, index) => (
              <div
                key={ab.source}
                className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] animate-fade-in"
                style={{
                  background: "linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(236, 72, 153, 0.05) 100%)",
                  border: "1px solid rgba(168, 85, 247, 0.2)",
                  animationDelay: `${index * 0.05}s`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                <div className="relative">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                      <svg className="h-6 w-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <button
                      onClick={() => handleDelete(ab.source)}
                      disabled={deletingSource === ab.source}
                      className="flex h-8 w-8 items-center justify-center rounded-lg opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {deletingSource === ab.source ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                      ) : (
                        <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <h3 className="mb-1 truncate text-sm font-semibold text-white" title={ab.source}>{ab.source}</h3>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">Audio</span>
                    <span className="text-xs text-zinc-500">{ab.chunk_count} chunks</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function AudiobooksPage() {
  return (
    <ProtectedLayout>
      <AudiobooksContent />
    </ProtectedLayout>
  );
}
