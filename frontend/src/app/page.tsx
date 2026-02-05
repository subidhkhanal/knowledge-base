"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { useChatHistory } from "@/hooks/useChatHistory";

interface Source {
  source: string;
  page: number | null;
  similarity: number;
  chunk_id?: string;
  text?: string;
}

interface ChunkContext {
  id: string;
  text: string;
  source: string;
  source_type: string;
  page: number | null;
  chunk_index: number;
  total_chunks: number;
  prev_chunks: Array<{ text: string; chunk_index: number; page?: number }>;
  next_chunks: Array<{ text: string; chunk_index: number; page?: number }>;
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
  const { authFetch, createAuthXhr } = useAuthFetch();
  const {
    messages,
    setMessages,
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    isLoaded
  } = useChatHistory();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; progress: number } | null>(null);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [chunkContext, setChunkContext] = useState<ChunkContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const handleFileUpload = (file: File) => {
    const toastId = addToast({
      type: "loading",
      message: `Uploading ${file.name}`,
      subMessage: "0%",
    });

    setUploadProgress({ fileName: file.name, progress: 0 });

    const formData = new FormData();
    formData.append("file", file);

    const endpoint = "/api/upload/document";

    const xhr = createAuthXhr("POST", endpoint);
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress({ fileName: file.name, progress: percent });

        if (percent === 100) {
          // Switch to processing message when upload completes
          updateToast(toastId, {
            message: `Processing ${file.name}`,
            subMessage: "Indexing document..."
          });

          // Animate dots to show activity
          let dots = 0;
          processingIntervalRef.current = setInterval(() => {
            dots = (dots + 1) % 4;
            updateToast(toastId, {
              subMessage: `Indexing document${'.'.repeat(dots)}`
            });
          }, 500);
        } else {
          updateToast(toastId, { subMessage: `${percent}%` });
        }
      }
    });

    xhr.addEventListener("load", () => {
      // Clear the processing animation interval
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
      }

      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          removeToast(toastId);
          addToast({
            type: "success",
            message: "Upload complete",
            subMessage: "Document added to knowledge base",
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.addEventListener("error", () => {
      // Clear the processing animation interval
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
      }

      removeToast(toastId);
      addToast({ type: "error", message: "Upload failed", subMessage: "Could not connect to server" });
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
        body: JSON.stringify({
          question: input.trim()
        }),
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
    if (currentConversationId) {
      deleteConversation(currentConversationId);
    }
  };

  const handleNewChat = () => {
    createConversation();
  };

  const handleSourceClick = async (source: Source) => {
    setSelectedSource(source);

    if (source.chunk_id) {
      setIsLoadingContext(true);
      try {
        const response = await authFetch(`/api/chunks/${source.chunk_id}?context_size=0`);
        if (response.ok) {
          const data = await response.json();
          setChunkContext(data);
        }
      } catch (error) {
        console.error("Failed to fetch chunk context:", error);
      } finally {
        setIsLoadingContext(false);
      }
    }
  };

  const closeSourceModal = () => {
    setSelectedSource(null);
    setChunkContext(null);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  // Show loading state while chat history is loading
  if (!isLoaded) {
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

      {/* Source Context Modal */}
      {selectedSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.7)' }}
          onClick={closeSourceModal}
        >
          <div
            className="relative max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="sticky top-0 flex items-center justify-between px-6 py-4"
              style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: 'var(--accent-subtle)' }}
                >
                  <svg className="h-5 w-5" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selectedSource.source}
                  </h3>
                  {selectedSource.page && (
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      Page {selectedSource.page}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={closeSourceModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {isLoadingContext ? (
                <div className="flex items-center justify-center py-12">
                  <svg className="h-8 w-8 animate-spin" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : chunkContext ? (
                <div className="space-y-4">
                  {/* Previous Context */}
                  {chunkContext.prev_chunks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                        Previous Context
                      </p>
                      {chunkContext.prev_chunks.map((chunk, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg px-4 py-3 text-sm leading-relaxed"
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                        >
                          {chunk.text}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Main Chunk (Highlighted) */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                      Matched Content
                    </p>
                    <div
                      className="rounded-lg px-4 py-3 text-sm leading-relaxed"
                      style={{
                        background: 'var(--accent-subtle)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--accent)',
                        borderLeftWidth: '4px'
                      }}
                    >
                      {chunkContext.text}
                    </div>
                  </div>

                  {/* Next Context */}
                  {chunkContext.next_chunks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                        Following Context
                      </p>
                      {chunkContext.next_chunks.map((chunk, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg px-4 py-3 text-sm leading-relaxed"
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                        >
                          {chunk.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : selectedSource.text ? (
                /* Fallback: Show the chunk text directly if context fetch failed */
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                    Source Content
                  </p>
                  <div
                    className="rounded-lg px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {selectedSource.text}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <svg className="h-12 w-12 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    Source context not available
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Try asking a new question to see source content
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
            {/* Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="group flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-[1.02] cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              title="Upload documents"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="hidden lg:inline">Upload</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.epub,.docx,.doc,.html,.htm,.txt,.md,.markdown"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className="hidden"
            />

            {/* Documents Link */}
            <Link
              href="/documents"
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-[1.02] cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Documents
            </Link>
          </nav>

        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Past Conversations */}
        <aside
          className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 transition-all duration-300 overflow-hidden`}
          style={{ borderRight: sidebarOpen ? '1px solid var(--border)' : 'none' }}
        >
          <div className="flex h-full w-64 flex-col" style={{ background: 'var(--bg-secondary)' }}>
            {/* New Chat Button */}
            <div className="p-3">
              <button
                onClick={handleNewChat}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all cursor-pointer"
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-primary)'}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Chat
              </button>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {conversations.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No conversations yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group relative flex items-center rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                        conv.id === currentConversationId ? 'bg-[var(--bg-hover)]' : ''
                      }`}
                      onClick={() => selectConversation(conv.id)}
                      onMouseEnter={(e) => {
                        if (conv.id !== currentConversationId) {
                          e.currentTarget.style.background = 'var(--bg-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (conv.id !== currentConversationId) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                      style={{
                        background: conv.id === currentConversationId ? 'var(--bg-hover)' : 'transparent'
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        {editingConversationId === conv.id ? (
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => {
                              if (editingTitle.trim()) {
                                renameConversation(conv.id, editingTitle);
                              }
                              setEditingConversationId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editingTitle.trim()) {
                                  renameConversation(conv.id, editingTitle);
                                }
                                setEditingConversationId(null);
                              } else if (e.key === 'Escape') {
                                setEditingConversationId(null);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            className="w-full text-sm font-medium bg-transparent outline-none rounded px-1 -mx-1"
                            style={{
                              color: 'var(--text-primary)',
                              border: '1px solid var(--accent)'
                            }}
                          />
                        ) : (
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: conv.id === currentConversationId ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingConversationId(conv.id);
                              setEditingTitle(conv.title);
                            }}
                            title="Double-click to rename"
                          >
                            {conv.title}
                          </p>
                        )}
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          {formatDate(conv.updatedAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded transition-all cursor-pointer"
                        style={{ color: 'var(--text-tertiary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-tertiary)';
                          e.currentTarget.style.color = 'var(--error)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--text-tertiary)';
                        }}
                        title="Delete conversation"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Toggle Sidebar Button */}
            <div className="p-3 border-t flex justify-center" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer"
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-primary)'}
                title="Hide sidebar"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Toggle Sidebar Button (when closed) */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="fixed left-3 bottom-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
              title="Show sidebar"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          )}

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
                    Query your uploaded documents
                  </p>
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
                        <div
                          className="rounded-2xl px-5 py-4"
                          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                        >
                          <div className="prose-chat">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>

                          {message.sources && message.sources.length > 0 && (
                            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
                                Sources
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {/* Deduplicate sources by filename, keeping the one with highest similarity */}
                                {Object.values(
                                  message.sources.reduce((acc, source) => {
                                    const key = source.source;
                                    if (!acc[key] || (source.similarity || 0) > (acc[key].similarity || 0)) {
                                      acc[key] = source;
                                    }
                                    return acc;
                                  }, {} as Record<string, Source>)
                                ).map((source, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleSourceClick(source)}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all cursor-pointer hover:scale-[1.02]"
                                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                    title="Click to view source context"
                                  >
                                    <svg className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="font-medium">{source.source}</span>
                                    {source.page && <span style={{ color: 'var(--text-tertiary)' }}>p.{source.page}</span>}
                                  </button>
                                ))}
                              </div>
                            </div>
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
                className="flex items-end gap-3 rounded-xl px-4 py-4 cursor-text"
                style={{ background: 'var(--bg-secondary)', minHeight: '56px' }}
                onClick={(e) => {
                  const textarea = e.currentTarget.querySelector('textarea');
                  if (textarea) textarea.focus();
                }}
              >
                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim() && !isLoading) {
                        handleSubmit(e);
                      }
                    }
                  }}
                  placeholder="Ask a question..."
                  className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed"
                  style={{
                    color: 'var(--text-primary)',
                    minHeight: '24px',
                    maxHeight: '120px'
                  }}
                  disabled={isLoading}
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all disabled:opacity-30 cursor-pointer"
                  style={{ background: 'var(--accent)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </form>
          </footer>
        </div>
      </div>
    </div>
  );
}
