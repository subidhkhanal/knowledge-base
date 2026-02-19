"use client";

import { useRef } from "react";
import Link from "next/link";

interface HeaderProps {
  onToggleSidebar?: () => void;
  onFileUpload?: (file: File) => void;
}

export function Header({ onToggleSidebar, onFileUpload }: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: "var(--bg-primary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Sidebar toggle + Logo + Title */}
        <div className="flex items-center gap-2.5">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer hover:bg-bg-hover"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Toggle sidebar"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, #0284c7 100%)",
              }}
            >
              <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Personal Knowledge Base
            </span>
          </Link>
        </div>

        {/* Right: Upload + Documents nav */}
        <div className="flex items-center gap-1">
          {onFileUpload && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-bg-hover"
                style={{ color: "var(--text-secondary)" }}
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
                  if (file && onFileUpload) onFileUpload(file);
                  if (e.target) e.target.value = "";
                }}
                className="hidden"
              />
            </>
          )}
          <Link
            href="/projects"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-bg-hover"
            style={{ color: "var(--text-secondary)" }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
            </svg>
            <span className="hidden lg:inline">Projects</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
