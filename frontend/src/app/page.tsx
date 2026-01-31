"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { useChatHistory } from "@/hooks/useChatHistory";

interface Source {
  source: string;
  page: number | null;
  similarity: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  provider?: string;
}

interface Toast {
  id: string;
  type: "success" | "error" | "loading";
  message: string;
  subMessage?: string;
}

export default function Home() {
  const { data: session, status } = useSession();
  const { authFetch, createAuthXhr } = useAuthFetch();
  const { messages, setMessages, isLoaded } = useChatHistory();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAppsMenu, setShowAppsMenu] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; progress: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const appsMenuRef = useRef<HTMLDivElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (appsMenuRef.current && !appsMenuRef.current.contains(e.target as Node)) {
        setShowAppsMenu(false);
      }
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setShowUploadMenu(false);
      }
    };
    if (showAppsMenu || showUploadMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAppsMenu, showUploadMenu]);

  // Toast auto-remove
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

  const handleFileUpload = (file: File, type: "document" | "audio") => {
    setShowUploadMenu(false);
    const toastId = addToast({
      type: "loading",
      message: `Uploading ${file.name}`,
      subMessage: "0%",
    });

    setUploadProgress({ fileName: file.name, progress: 0 });

    const formData = new FormData();
    formData.append("file", file);

    const endpoint = type === "document" ? "/api/upload/document" : "/api/upload/audio";

    const xhr = createAuthXhr("POST", endpoint);
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress({ fileName: file.name, progress: percent });
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
            subMessage: `${data.chunks_created || data.chunk_count || 0} chunks created`,
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
        addToast({ type: "error", message: "Upload failed", subMessage: "Invalid response" });
      }
      setUploadProgress(null);
      if (documentInputRef.current) documentInputRef.current.value = "";
      if (audioInputRef.current) audioInputRef.current.value = "";
    });

    xhr.addEventListener("error", () => {
      removeToast(toastId);
      addToast({ type: "error", message: "Upload failed", subMessage: "Could not connect to server" });
      setUploadProgress(null);
      if (documentInputRef.current) documentInputRef.current.value = "";
      if (audioInputRef.current) audioInputRef.current.value = "";
    });

    xhr.send(formData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await authFetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input.trim() }),
      });

      if (!response.ok) throw new Error("Query failed");

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        sources: data.sources,
        provider: data.provider,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Unable to connect. Please ensure the backend is running.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  // Show loading state while session is loading
  if (status === "loading" || !isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <svg className="h-8 w-8 animate-spin" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--bg-primary)' }}>
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
            <button onClick={() => removeToast(toast.id)} className="mt-0.5 cursor-pointer opacity-50 transition-opacity hover:opacity-100" style={{ color: "var(--text-tertiary)" }}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Header - Glassmorphism Navbar */}
      <header
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{
          background: 'rgba(var(--bg-primary-rgb, 17, 17, 17), 0.8)',
          borderBottom: '1px solid var(--border)',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)'
        }}
      >
        <div className="flex items-center justify-between px-6 py-3">
          {/* Logo & Brand */}
          <Link href="/" className="group flex items-center gap-3">
            <div
              className="relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)',
                boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)'
              }}
            >
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 blur transition-opacity duration-300 group-hover:opacity-30" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold tracking-tight transition-colors" style={{ color: 'var(--text-primary)' }}>
                Knowledge Base
              </span>
              <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                AI Assistant
              </span>
            </div>
          </Link>

          {/* Center Navigation */}
          <nav className="hidden md:flex items-center gap-1 rounded-full px-2 py-1.5" style={{ background: 'var(--bg-secondary)' }}>
            {/* Apps Menu */}
            <div className="relative" ref={appsMenuRef}>
              <button
                onClick={() => setShowAppsMenu(!showAppsMenu)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${showAppsMenu ? 'scale-95' : 'hover:scale-[1.02]'}`}
                style={{
                  color: showAppsMenu ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: showAppsMenu ? 'var(--bg-hover)' : 'transparent'
                }}
                onMouseEnter={(e) => { if (!showAppsMenu) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (!showAppsMenu) e.currentTarget.style.background = 'transparent'; }}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Apps
                <svg className={`h-3 w-3 transition-transform duration-200 ${showAppsMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Apps Dropdown */}
              {showAppsMenu && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-80 rounded-2xl p-4 shadow-2xl animate-fade-in z-50"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    backdropFilter: 'blur(20px)'
                  }}
                >
                  <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                    Browse Content
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Link
                      href="/documents"
                      onClick={() => setShowAppsMenu(false)}
                      className="group relative flex flex-col items-center justify-center overflow-hidden rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5"
                      style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f1c2e 100%)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110" style={{ background: 'rgba(59, 130, 246, 0.25)' }}>
                        <svg className="h-6 w-6" style={{ color: '#60a5fa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <span className="relative text-sm font-semibold text-white">Documents</span>
                      <span className="relative mt-1 text-[10px] text-white/50">PDFs, EPUBs, Docs</span>
                    </Link>

                    <Link
                      href="/audiobooks"
                      onClick={() => setShowAppsMenu(false)}
                      className="group relative flex flex-col items-center justify-center overflow-hidden rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5"
                      style={{ background: 'linear-gradient(135deg, #4a1d6a 0%, #1a0a2e 100%)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110" style={{ background: 'rgba(168, 85, 247, 0.25)' }}>
                        <svg className="h-6 w-6" style={{ color: '#c084fc' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      </div>
                      <span className="relative text-sm font-semibold text-white">Audiobooks</span>
                      <span className="relative mt-1 text-[10px] text-white/50">Audio files</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Upload Menu */}
            <div className="relative" ref={uploadMenuRef}>
              <button
                onClick={() => setShowUploadMenu(!showUploadMenu)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${showUploadMenu ? 'scale-95' : 'hover:scale-[1.02]'}`}
                style={{
                  color: showUploadMenu ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: showUploadMenu ? 'var(--bg-hover)' : 'transparent'
                }}
                onMouseEnter={(e) => { if (!showUploadMenu) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (!showUploadMenu) e.currentTarget.style.background = 'transparent'; }}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload
                <svg className={`h-3 w-3 transition-transform duration-200 ${showUploadMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Upload Dropdown */}
              {showUploadMenu && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-64 rounded-2xl p-2 shadow-2xl animate-fade-in z-50"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', backdropFilter: 'blur(20px)' }}
                >
                  <button
                    onClick={() => documentInputRef.current?.click()}
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-200 hover:scale-[1.01]"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
                      <svg className="h-5 w-5" style={{ color: '#60a5fa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Documents</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>PDF, EPUB, DOCX, TXT</p>
                    </div>
                    <svg className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--text-tertiary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => audioInputRef.current?.click()}
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-200 hover:scale-[1.01]"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110" style={{ background: 'rgba(168, 85, 247, 0.15)' }}>
                      <svg className="h-5 w-5" style={{ color: '#c084fc' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Audio</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>MP3, WAV, M4A, FLAC</p>
                    </div>
                    <svg className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--text-tertiary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Hidden file inputs */}
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.epub,.docx,.doc,.html,.htm,.txt,.md,.markdown"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, "document");
                }}
                className="hidden"
              />
              <input
                ref={audioInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.flac,.ogg,.webm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, "audio");
                }}
                className="hidden"
              />
            </div>

            {/* Sources Link */}
            <Link
              href="/sources"
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Sources
            </Link>
          </nav>

          {/* Right Side - User Section */}
          <div className="flex items-center gap-3">
            {session ? (
              <div className="group relative flex items-center gap-3">
                <div className="flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-4 transition-all duration-200" style={{ background: 'var(--bg-secondary)' }}>
                  {session.user?.image ? (
                    <img
                      src={session.user.image}
                      alt=""
                      className="h-8 w-8 rounded-full ring-2 ring-white/10 transition-all group-hover:ring-purple-500/50"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'var(--accent)' }}>
                      <span className="text-sm font-medium text-white">
                        {session.user?.name?.charAt(0) || 'U'}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                      {session.user?.name?.split(' ')[0] || 'User'}
                    </span>
                    <span className="text-[10px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>
                      Signed in
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => signOut()}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 hover:scale-105"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                  title="Sign out"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn("github")}
                className="group flex items-center gap-2 rounded-full py-2 pl-3 pr-4 text-sm font-medium transition-all duration-300 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #24292e 0%, #1a1a1a 100%)',
                  color: 'white',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                }}
              >
                <svg className="h-5 w-5 transition-transform group-hover:rotate-12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in with GitHub
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {messages.length === 0 ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--accent-subtle)' }}>
                <svg className="h-8 w-8" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-medium" style={{ color: 'var(--text-primary)' }}>
                Ask anything
              </h2>
              <p className="max-w-sm text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Query your uploaded documents and notes
              </p>
              {!session && (
                <p className="mt-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Chat history saved locally.{' '}
                  <button
                    onClick={() => signIn("github")}
                    className="underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    Sign in
                  </button>
                  {' '}to sync across devices.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  {message.role === "user" ? (
                    <div className="flex justify-end">
                      <div
                        className="max-w-[85%] rounded-2xl px-4 py-3"
                        style={{ background: 'var(--accent)', color: 'white' }}
                      >
                        <p className="text-sm leading-relaxed">{message.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div
                        className="rounded-2xl px-4 py-3"
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                          {message.content}
                        </p>

                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                            <div className="flex flex-wrap gap-2">
                              {message.sources.map((source, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                                >
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  {source.source}
                                  {source.page && <span style={{ color: 'var(--text-tertiary)' }}>p.{source.page}</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {message.provider && (
                        <p className="px-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {message.provider}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="animate-fade-in">
                  <div
                    className="inline-flex items-center gap-1 rounded-2xl px-4 py-3"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse-subtle" style={{ background: 'var(--text-tertiary)' }} />
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse-subtle" style={{ background: 'var(--text-tertiary)', animationDelay: '0.2s' }} />
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse-subtle" style={{ background: 'var(--text-tertiary)', animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <footer className="px-6 pb-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                title="Clear chat"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)' }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-all disabled:opacity-30"
              style={{ background: 'var(--accent)' }}
            >
              <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
