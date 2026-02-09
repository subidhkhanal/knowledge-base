"use client";

import { motion } from "framer-motion";
import type { Source, ChunkContext } from "@/types/chat";

interface SourceModalProps {
  source: Source;
  chunkContext: ChunkContext | null;
  isLoadingContext: boolean;
  onClose: () => void;
}

export function SourceModal({ source, chunkContext, isLoadingContext, onClose }: SourceModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.7)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          boxShadow: "0 0 0 1px var(--border), 0 8px 24px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="sticky top-0 flex items-center justify-between px-6 py-4"
          style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "var(--accent-subtle)", border: "1px solid var(--border-accent)" }}
            >
              <svg className="h-5 w-5" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {source.source}
              </h3>
              {source.page && (
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Page {source.page}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer hover:bg-bg-hover"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: "calc(80vh - 80px)" }}>
          {isLoadingContext ? (
            <div className="flex items-center justify-center py-12">
              <svg className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : chunkContext ? (
            <div className="space-y-4">
              {/* Previous Context */}
              {chunkContext.prev_chunks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    Previous Context
                  </p>
                  {chunkContext.prev_chunks.map((chunk, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg px-4 py-3 text-sm leading-relaxed"
                      style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}
                    >
                      {chunk.text}
                    </div>
                  ))}
                </div>
              )}

              {/* Main Chunk (Highlighted) */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                  Matched Content
                </p>
                <div
                  className="rounded-lg px-4 py-3 text-sm leading-relaxed"
                  style={{
                    background: "var(--accent-subtle)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-accent)",
                    borderLeftWidth: "4px",
                  }}
                >
                  {chunkContext.text}
                </div>
              </div>

              {/* Next Context */}
              {chunkContext.next_chunks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    Following Context
                  </p>
                  {chunkContext.next_chunks.map((chunk, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg px-4 py-3 text-sm leading-relaxed"
                      style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}
                    >
                      {chunk.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : source.text ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                Source Content
              </p>
              <div
                className="rounded-lg px-4 py-3 text-sm leading-relaxed"
                style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              >
                {source.text}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <svg className="h-12 w-12 mx-auto mb-3" style={{ color: "var(--text-tertiary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm mb-1" style={{ color: "var(--text-tertiary)" }}>
                Source context not available
              </p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Try asking a new question to see source content
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
