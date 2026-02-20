"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type BackendStatus = "checking" | "waking" | "online" | "offline";

const INITIAL_GRACE_MS = 3000;
const RETRY_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 60000;

export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>("checking");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const pingHealth = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(`${API_URL}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const startPolling = useCallback(() => {
    startTimeRef.current = Date.now();
    setStatus("checking");
    setElapsedSeconds(0);

    elapsedRef.current = setInterval(() => {
      if (!isMountedRef.current) return;
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    const poll = async () => {
      if (!isMountedRef.current) return;

      const elapsed = Date.now() - startTimeRef.current;

      if (elapsed > MAX_TIMEOUT_MS) {
        setStatus("offline");
        if (timerRef.current) clearInterval(timerRef.current);
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        return;
      }

      const isUp = await pingHealth();
      if (!isMountedRef.current) return;

      if (isUp) {
        setStatus("online");
        if (timerRef.current) clearInterval(timerRef.current);
        if (elapsedRef.current) clearInterval(elapsedRef.current);
        return;
      }

      if (elapsed > INITIAL_GRACE_MS) {
        setStatus((prev) => (prev === "checking" ? "waking" : prev));
      }
    };

    poll();
    timerRef.current = setInterval(poll, RETRY_INTERVAL_MS);
  }, [pingHealth]);

  const retry = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    startPolling();
  }, [startPolling]);

  useEffect(() => {
    isMountedRef.current = true;
    startPolling();

    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [startPolling]);

  return { status, elapsedSeconds, retry };
}
