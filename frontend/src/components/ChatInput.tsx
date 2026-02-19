"use client";

import { useState, useRef } from "react";

export type ChatMode = "rag" | "llm" | "research";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  isLoading: boolean;
  compact?: boolean;
  placeholder?: string;
  mode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
}

const modes: { key: ChatMode; label: string; icon: ChatMode }[] = [
  { key: "rag", label: "RAG", icon: "rag" },
  { key: "llm", label: "LLM", icon: "llm" },
  { key: "research", label: "Research", icon: "research" },
];

function ModeIcon({ type, className }: { type: ChatMode; className?: string }) {
  if (type === "rag") {
    // Book icon
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    );
  }
  if (type === "research") {
    // Globe/search icon
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6" />
      </svg>
    );
  }
  // Chat bubble icon
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  );
}

export function ChatInput({ onSubmit, isLoading, compact, placeholder, mode, onModeChange }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSubmit(input.trim());
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  return (
    <footer className={compact ? "px-3 pb-3" : "px-4 md:px-6 pb-4 md:pb-6"}>
      <form onSubmit={handleSubmit} className={compact ? "" : "mx-auto max-w-3xl"}>
        {/* Mode selector */}
        {mode && onModeChange && (
          <div className="flex items-center gap-1.5 mb-2">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => onModeChange(m.key)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition-all duration-150"
                style={{
                  background: mode === m.key ? "var(--accent-subtle)" : "transparent",
                  color: mode === m.key ? "var(--accent)" : "var(--text-tertiary)",
                  border: mode === m.key ? "1px solid var(--border-accent)" : "1px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (mode !== m.key) {
                    e.currentTarget.style.background = "var(--bg-secondary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (mode !== m.key) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <ModeIcon type={m.icon} className="h-3.5 w-3.5" />
                {m.label}
              </button>
            ))}
          </div>
        )}

        <div
          className="flex items-end gap-3 rounded-xl px-4 py-3 cursor-text"
          style={{
            background: "var(--bg-secondary)",
            minHeight: "56px",
            border: isFocused ? "1px solid var(--accent)" : "1px solid transparent",
            boxShadow: isFocused ? "0 0 0 3px var(--accent-subtle)" : "none",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onClick={() => textareaRef.current?.focus()}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !isLoading) {
                  handleSubmit(e);
                }
              }
            }}
            placeholder={placeholder || "Ask me anything about your documents..."}
            className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed"
            style={{
              color: "var(--text-primary)",
              minHeight: "24px",
              maxHeight: "120px",
              boxShadow: "none",
            }}
            disabled={isLoading}
            rows={1}
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg disabled:opacity-30 cursor-pointer active:scale-[0.98]"
            style={{
              background: "var(--accent)",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </form>
    </footer>
  );
}
