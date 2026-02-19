"use client";

import { useState, useEffect, useCallback } from "react";
import type { Toast } from "@/types/chat";

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  return { toasts, addToast, removeToast, updateToast };
}
