"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { useAuthFetch } from "@/hooks/useAuthFetch";

type UploadType = "pdf" | "audio" | "text";

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

function UploadContent() {
  const { data: session } = useSession();
  const { authFetch, createAuthXhr } = useAuthFetch();
  const [activeTab, setActiveTab] = useState<UploadType>("pdf");
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    fileName: "",
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [textContent, setTextContent] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
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
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
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

  const handleFileUpload = async (file: File) => {
    const toastId = addToast({
      type: "loading",
      message: `Uploading ${file.name}`,
      subMessage: "0%",
    });

    setUploadState({
      isUploading: true,
      progress: 0,
      fileName: file.name,
    });

    const formData = new FormData();
    formData.append("file", file);

    const endpoint = activeTab === "pdf" ? "/api/upload/pdf" : "/api/upload/audio";

    const xhr = createAuthXhr("POST", endpoint);
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
            subMessage: `${data.chunks_created} chunks created from ${file.name}`,
          });
        } else {
          removeToast(toastId);
          addToast({
            type: "error",
            message: "Upload failed",
            subMessage: data.detail || "Unknown error",
          });
        }
      } catch {
        removeToast(toastId);
        addToast({
          type: "error",
          message: "Upload failed",
          subMessage: "Invalid response from server",
        });
      }
      setUploadState({ isUploading: false, progress: 0, fileName: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.addEventListener("error", () => {
      removeToast(toastId);
      addToast({
        type: "error",
        message: "Connection failed",
        subMessage: "Could not connect to server",
      });
      setUploadState({ isUploading: false, progress: 0, fileName: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.addEventListener("abort", () => {
      removeToast(toastId);
      addToast({ type: "error", message: "Upload cancelled" });
      setUploadState({ isUploading: false, progress: 0, fileName: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.send(formData);
  };

  const cancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
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

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textContent.trim()) return;

    const toastId = addToast({
      type: "loading",
      message: "Processing text",
      subMessage: "Please wait...",
    });

    setUploadState({ isUploading: true, progress: 0, fileName: "" });

    try {
      const response = await authFetch("/api/upload/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: textContent,
          title: textTitle || "Untitled Note",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        removeToast(toastId);
        addToast({
          type: "success",
          message: "Text added",
          subMessage: `${data.chunks_created} chunks created`,
        });
        setTextContent("");
        setTextTitle("");
      } else {
        removeToast(toastId);
        addToast({
          type: "error",
          message: "Failed to add text",
          subMessage: data.detail || "Unknown error",
        });
      }
    } catch {
      removeToast(toastId);
      addToast({
        type: "error",
        message: "Connection failed",
        subMessage: "Could not connect to server",
      });
    } finally {
      setUploadState({ isUploading: false, progress: 0, fileName: "" });
    }
  };

  const tabs = [
    {
      id: "pdf" as UploadType,
      label: "PDF",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      accept: ".pdf",
    },
    {
      id: "audio" as UploadType,
      label: "Audio",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      ),
      accept: ".mp3,.wav,.m4a,.flac,.ogg,.webm",
    },
    {
      id: "text" as UploadType,
      label: "Notes",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      accept: "",
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Toast Notifications */}
      <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-fade-in flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", minWidth: "280px" }}
          >
            {toast.type === "loading" && (
              <div className="mt-0.5">
                <svg className="h-5 w-5 animate-spin" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
            {toast.type === "success" && (
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "var(--success-bg)" }}>
                <svg className="h-3 w-3" style={{ color: "var(--success)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {toast.type === "error" && (
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "var(--error-bg)" }}>
                <svg className="h-3 w-3" style={{ color: "var(--error)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{toast.message}</p>
              {toast.subMessage && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{toast.subMessage}</p>}
            </div>
            <button onClick={() => removeToast(toast.id)} className="mt-0.5 opacity-50 transition-opacity hover:opacity-100" style={{ color: "var(--text-tertiary)" }}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <Link href="/" className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>Knowledge Base</Link>
        <nav className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors" style={{ color: "var(--text-secondary)" }}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Chat
          </Link>
          <Link href="/sources" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors" style={{ color: "var(--text-secondary)" }}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Sources
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
      <main className="mx-auto max-w-xl px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-medium" style={{ color: "var(--text-primary)" }}>Add Content</h1>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Upload files or paste text to your knowledge base</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 inline-flex w-full rounded-lg p-1" style={{ background: "var(--bg-secondary)" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              disabled={uploadState.isUploading}
              className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
              style={{ background: activeTab === tab.id ? "var(--bg-elevated)" : "transparent", color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-tertiary)" }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Upload Area */}
        <div className="rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          {activeTab === "text" ? (
            <form onSubmit={handleTextSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="Title (optional)"
                  disabled={uploadState.isUploading}
                  className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-all disabled:opacity-50"
                  style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste your notes or text content..."
                  rows={8}
                  disabled={uploadState.isUploading}
                  className="w-full resize-none rounded-lg px-4 py-3 text-sm outline-none transition-all disabled:opacity-50"
                  style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={uploadState.isUploading || !textContent.trim()}
                className="w-full rounded-lg py-3 text-sm font-medium transition-all disabled:opacity-40"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {uploadState.isUploading ? "Processing..." : "Add to Knowledge Base"}
              </button>
            </form>
          ) : (
            <div>
              {uploadState.isUploading ? (
                <div className="py-8">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--accent-subtle)" }}>
                        <svg className="h-5 w-5" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{uploadState.fileName}</p>
                        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Uploading... {uploadState.progress}%</p>
                      </div>
                    </div>
                    <button onClick={cancelUpload} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>Cancel</button>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-tertiary)" }}>
                    <div className="h-full rounded-full transition-all duration-300" style={{ background: "var(--accent)", width: `${uploadState.progress}%` }} />
                  </div>
                  <div className="mt-3 flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
                    <span>Progress</span>
                    <span className="font-medium" style={{ color: "var(--accent)" }}>{uploadState.progress}%</span>
                  </div>
                </div>
              ) : (
                <div
                  className="flex cursor-pointer flex-col items-center justify-center rounded-lg py-12 transition-all"
                  style={{ border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border)"}`, background: isDragging ? "var(--accent-subtle)" : "transparent" }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "var(--accent-subtle)" }}>
                    <svg className="h-6 w-6" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="mb-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{activeTab === "pdf" ? "Drop PDF here" : "Drop audio file here"}</p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{activeTab === "pdf" ? "or click to browse" : "MP3, WAV, M4A, FLAC, OGG, WebM"}</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept={tabs.find((t) => t.id === activeTab)?.accept} onChange={handleFileChange} className="hidden" disabled={uploadState.isUploading} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function UploadPage() {
  return <UploadContent />;
}
