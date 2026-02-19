"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Toast as ToastType } from "@/types/chat";

interface ToastContainerProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

const toastVariants = {
  initial: { opacity: 0, y: -8, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.96 },
};

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            variants={toastVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-start gap-3 rounded-xl px-4 py-3"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              minWidth: "280px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)",
            }}
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
            <button
              onClick={() => onRemove(toast.id)}
              className="mt-0.5 cursor-pointer opacity-50 transition-opacity hover:opacity-100"
              style={{ color: "var(--text-tertiary)" }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
