"use client";

import { useState, useRef } from "react";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSubmit, isLoading }: ChatInputProps) {
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
    <footer className="px-4 md:px-6 pb-4 md:pb-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
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
            placeholder="Ask me anything about your documents..."
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
