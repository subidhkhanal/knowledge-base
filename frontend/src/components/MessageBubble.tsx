"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Message, Source } from "@/types/chat";

interface MessageBubbleProps {
  message: Message;
  onSourceClick: (source: Source) => void;
}

function SourcesCollapsible({
  sources,
  onSourceClick,
}: {
  sources: Source[];
  onSourceClick: (s: Source) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const uniqueSources = Object.values(
    sources.reduce((acc, source) => {
      const key = source.source;
      if (!acc[key] || (source.similarity || 0) > (acc[key].similarity || 0)) {
        acc[key] = source;
      }
      return acc;
    }, {} as Record<string, Source>)
  );

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium cursor-pointer rounded px-2 py-1 hover:bg-bg-hover"
        style={{ color: "var(--accent)" }}
      >
        <svg
          className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Sources ({uniqueSources.length})
      </button>
      {isOpen && (
        <div className="mt-2 flex flex-wrap gap-2 pl-5">
          {uniqueSources.map((source, idx) => (
            <button
              key={idx}
              onClick={() => onSourceClick(source)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:bg-bg-hover"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              <svg
                className="h-3.5 w-3.5"
                style={{ color: "var(--accent)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium">{source.source}</span>
              {source.page && (
                <span style={{ color: "var(--text-tertiary)" }}>p.{source.page}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message, onSourceClick }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  if (message.role === "user") {
    return (
      <div className="flex items-start gap-3">
        {/* User avatar */}
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--bg-elevated)" }}
        >
          <svg
            className="h-4 w-4"
            style={{ color: "var(--text-tertiary)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        {/* Message text */}
        <div className="flex-1 min-w-0 pt-1">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      {/* Assistant avatar */}
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--accent)" }}
      >
        <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0 pt-1">
        {/* Collapsible sources (like "Agent steps") */}
        {message.sources && message.sources.length > 0 && (
          <SourcesCollapsible sources={message.sources} onSourceClick={onSourceClick} />
        )}

        {/* Main content */}
        {message.content ? (
          <div className="prose-chat">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse-subtle" style={{ background: "var(--accent)" }} />
            <span className="h-1.5 w-1.5 rounded-full animate-pulse-subtle" style={{ background: "var(--accent)", animationDelay: "0.2s" }} />
            <span className="h-1.5 w-1.5 rounded-full animate-pulse-subtle" style={{ background: "var(--accent)", animationDelay: "0.4s" }} />
          </div>
        )}

        {/* Copy button + Provider info */}
        {message.content && (
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs cursor-pointer rounded px-2 py-1 hover:bg-bg-hover"
              style={{ color: "var(--text-tertiary)" }}
            >
              {copied ? (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
