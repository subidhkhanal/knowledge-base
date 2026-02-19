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
              BrainForge
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
            href="/articles"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-bg-hover"
            style={{ color: "var(--text-secondary)" }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="hidden lg:inline">Articles</span>
          </Link>
          <Link
            href="/documents"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-bg-hover"
            style={{ color: "var(--text-secondary)" }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="hidden lg:inline">Documents</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
