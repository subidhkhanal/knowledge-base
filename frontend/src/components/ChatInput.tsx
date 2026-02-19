"use client";

import { useState, useRef } from "react";

export type ChatMode = "rag" | "llm" | "research";
export type ResearchQuality = "quick" | "standard" | "deep";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  isLoading: boolean;
  compact?: boolean;
  placeholder?: string;
  mode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  researchQuality?: ResearchQuality;
  onResearchQualityChange?: (quality: ResearchQuality) => void;
}

const modes: { key: ChatMode; label: string; desc: string }[] = [
  { key: "rag", label: "Ask Docs", desc: "Search your documents" },
  { key: "llm", label: "Chat", desc: "General AI conversation" },
  { key: "research", label: "Research", desc: "Generate a full article" },
];

const depthOptions: { key: ResearchQuality; label: string; desc: string }[] = [
  { key: "quick", label: "Quick", desc: "~3 min, brief overview" },
  { key: "standard", label: "Standard", desc: "~8 min, thorough article" },
  { key: "deep", label: "Deep", desc: "~20 min, book-length piece" },
];

function ModeIcon({ type, className }: { type: ChatMode; className?: string }) {
  if (type === "rag") {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    );
  }
  if (type === "research") {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  );
}

export function ChatInput({ onSubmit, isLoading, compact, placeholder, mode, onModeChange, researchQuality, onResearchQualityChange }: ChatInputProps) {
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

  const currentDepth = depthOptions.find((d) => d.key === researchQuality);

  return (
    <footer className={compact ? "px-3 pb-3" : "px-4 md:px-6 pb-4 md:pb-6"}>
      <form onSubmit={handleSubmit} className={compact ? "" : "mx-auto max-w-3xl"}>
        {/* Mode selector */}
        {mode && onModeChange && (
          <div className="mb-2 space-y-1.5">
            <div className="flex items-center gap-1">
              {modes.map((m) => {
                const isActive = mode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => onModeChange(m.key)}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-all duration-150"
                    style={{
                      background: isActive ? "var(--accent-subtle)" : "transparent",
                      color: isActive ? "var(--accent)" : "var(--text-tertiary)",
                      border: isActive ? "1px solid var(--border-accent)" : "1px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = "var(--bg-secondary)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                    title={m.desc}
                  >
                    <ModeIcon type={m.key} className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Research depth — appears inline when research mode is active */}
            {mode === "research" && researchQuality && onResearchQualityChange && (
              <div
                className="flex items-center gap-0.5 rounded-lg px-2 py-1"
                style={{ background: "var(--bg-secondary)" }}
              >
                <span className="text-[10px] font-medium mr-1.5" style={{ color: "var(--text-tertiary)" }}>
                  Depth
                </span>
                {depthOptions.map((d) => {
                  const isActive = researchQuality === d.key;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => onResearchQualityChange(d.key)}
                      className="rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-all duration-150"
                      style={{
                        background: isActive ? "var(--bg-primary)" : "transparent",
                        color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                        boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.color = "var(--text-secondary)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.color = "var(--text-tertiary)";
                      }}
                      title={d.desc}
                    >
                      {d.label}
                    </button>
                  );
                })}
                <span className="ml-auto text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  {currentDepth?.desc}
                </span>
              </div>
            )}
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
            placeholder={
              mode === "research"
                ? "Enter a topic to research..."
                : mode === "llm"
                  ? "Ask anything..."
                  : placeholder || "Ask about your documents..."
            }
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
