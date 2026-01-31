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

export default function Home() {
  const { data: session, status } = useSession();
  const { authFetch } = useAuthFetch();
  const { messages, setMessages, isLoaded } = useChatHistory();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h1 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
          Knowledge Base
        </h1>
        <nav className="flex items-center gap-2">
          <Link
            href="/upload"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'transparent' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
            Upload
          </Link>
          <Link
            href="/sources"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'transparent' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Sources
          </Link>
          <div className="ml-2 flex items-center gap-2 border-l pl-4" style={{ borderColor: 'var(--border)' }}>
            {session ? (
              <>
                {session.user?.image && (
                  <img src={session.user.image} alt="" className="h-7 w-7 rounded-full" />
                )}
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {session.user?.name?.split(' ')[0]}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
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
                Query your uploaded documents, notes, and audio transcriptions
              </p>
              {!session && (
                <p className="mt-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Chat history saved locally.{' '}
                  <button
                    onClick={() => signIn("google")}
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
