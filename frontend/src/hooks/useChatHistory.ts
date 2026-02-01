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

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

const STORAGE_KEY = "kb_conversations";
const MAX_CONVERSATIONS = 50;

export function useChatHistory() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load conversations from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);
          setCurrentConversationId(parsed[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load conversations:", e);
    }
    setIsLoaded(true);
  }, []);

  // Save conversations to localStorage whenever they change
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const toStore = conversations.slice(0, MAX_CONVERSATIONS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.error("Failed to save conversations:", e);
    }
  }, [conversations, isLoaded]);

  // Get current conversation
  const currentConversation = conversations.find(c => c.id === currentConversationId);
  const messages = currentConversation?.messages || [];

  // Generate title from first user message
  const generateTitle = (content: string): string => {
    const maxLength = 30;
    const cleaned = content.trim().replace(/\n/g, ' ');
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.substring(0, maxLength).trim() + '...';
  };

  // Set messages for current conversation
  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    setConversations(prev => {
      const newMessages = typeof updater === 'function'
        ? updater(prev.find(c => c.id === currentConversationId)?.messages || [])
        : updater;

      // If no current conversation and we have messages, create one
      if (!currentConversationId && newMessages.length > 0) {
        const firstUserMessage = newMessages.find(m => m.role === 'user');
        const newConv: Conversation = {
          id: Date.now().toString(),
          title: firstUserMessage ? generateTitle(firstUserMessage.content) : 'New Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: newMessages,
        };
        setCurrentConversationId(newConv.id);
        return [newConv, ...prev];
      }

      // Update existing conversation
      return prev.map(conv => {
        if (conv.id === currentConversationId) {
          // Update title if this is the first user message
          let title = conv.title;
          if (conv.messages.length === 0 && newMessages.length > 0) {
            const firstUserMessage = newMessages.find(m => m.role === 'user');
            if (firstUserMessage) {
              title = generateTitle(firstUserMessage.content);
            }
          }
          return {
            ...conv,
            title,
            updatedAt: Date.now(),
            messages: newMessages,
          };
        }
        return conv;
      });
    });
  }, [currentConversationId]);

  // Create new conversation
  const createConversation = useCallback(() => {
    const newConv: Conversation = {
      id: Date.now().toString(),
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    setConversations(prev => [newConv, ...prev.slice(0, MAX_CONVERSATIONS - 1)]);
    setCurrentConversationId(newConv.id);
    return newConv.id;
  }, []);

  // Select a conversation
  const selectConversation = useCallback((id: string) => {
    setCurrentConversationId(id);
  }, []);

  // Delete a conversation
  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      // If we deleted the current conversation, switch to another
      if (id === currentConversationId) {
        setCurrentConversationId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  }, [currentConversationId]);

  // Clear current conversation messages
  const clearHistory = useCallback(() => {
    if (currentConversationId) {
      deleteConversation(currentConversationId);
    }
  }, [currentConversationId, deleteConversation]);

  return {
    messages,
    setMessages,
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
    clearHistory,
    isLoaded,
  };
}
