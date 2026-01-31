"use client";

import { useState, useEffect, useCallback } from "react";

interface Source {
  source: string;
  page: number | null;
  similarity: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  provider?: string;
  timestamp?: number;
}

const STORAGE_KEY = "kb_chat_history";
const MAX_MESSAGES = 100; // Limit stored messages

export function useChatHistory() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load messages from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setMessages(Array.isArray(parsed) ? parsed : []);
      }
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
    setIsLoaded(true);
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (!isLoaded) return;
    try {
      // Keep only the last MAX_MESSAGES
      const toStore = messages.slice(-MAX_MESSAGES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }
  }, [messages, isLoaded]);

  const addMessage = useCallback((message: Omit<Message, "timestamp">) => {
    setMessages((prev) => [...prev, { ...message, timestamp: Date.now() }]);
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error("Failed to clear chat history:", e);
    }
  }, []);

  return {
    messages,
    setMessages,
    addMessage,
    clearHistory,
    isLoaded,
  };
}
