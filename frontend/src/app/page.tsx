"use client";

import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useApi } from "@/hooks/useApi";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useToasts } from "@/hooks/useToasts";
import { useUpload } from "@/hooks/useUpload";
import type { Source, ChunkContext } from "@/types/chat";
import { ToastContainer } from "@/components/Toast";
import { SourceModal } from "@/components/SourceModal";
import { UploadModal } from "@/components/UploadModal";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { ChatInput } from "@/components/ChatInput";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { BackendStatusBanner } from "@/components/BackendStatusBanner";

export default function Home() {
  const { apiFetch } = useApi();
  const {
    messages,
    setMessages,
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    isLoaded,
  } = useChatHistory();

  const { status: backendStatus, elapsedSeconds, retry: retryBackend } = useBackendStatus();
  const { toasts, addToast, removeToast, updateToast } = useToasts();
  const { uploadFile } = useUpload({ addToast, removeToast, updateToast });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [chunkContext, setChunkContext] = useState<ChunkContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  const tokenQueueRef = useRef<{ content: string; type: string; sources?: Source[]; provider?: string }[]>([]);
  const drainIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startDraining = (assistantId: string) => {
    if (drainIntervalRef.current) return;

    drainIntervalRef.current = setInterval(() => {
      const queue = tokenQueueRef.current;
      if (queue.length === 0) return;

      const item = queue.shift()!;

      if (item.type === "token") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + item.content } : m
          )
        );
      } else if (item.type === "done") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, sources: item.sources, provider: item.provider } : m
          )
        );
        clearInterval(drainIntervalRef.current!);
        drainIntervalRef.current = null;
      }
    }, 30);
  };

  const handleSubmitMessage = async (inputText: string) => {
    if (isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: inputText,
    };

    const assistantId = (Date.now() + 1).toString();

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant" as const, content: "" },
    ]);
    setIsLoading(true);

    try {
      const chatHistory = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await apiFetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: inputText,
          chat_history: chatHistory.length > 0 ? chatHistory : undefined,
        }),
      });

      if (!response.ok) throw new Error("Query failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === "token") {
              const content = data.content;
              if (content.length > 20) {
                const words = content.split(/(\s+)/);
                for (const word of words) {
                  if (word) tokenQueueRef.current.push({ type: "token", content: word });
                }
              } else {
                tokenQueueRef.current.push({ type: "token", content: content });
              }
              startDraining(assistantId);
            } else if (data.type === "done") {
              tokenQueueRef.current.push({ type: "done", content: "", sources: data.sources, provider: data.provider });
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch {
      if (drainIntervalRef.current) {
        clearInterval(drainIntervalRef.current);
        drainIntervalRef.current = null;
      }
      tokenQueueRef.current = [];

      setMessages((prev) => {
        const hasAssistant = prev.some((m) => m.id === assistantId);
        if (hasAssistant) {
          return prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || "Unable to connect. Please ensure the backend is running." }
              : m
          );
        }
        return [
          ...prev,
          {
            id: assistantId,
            role: "assistant" as const,
            content: "Unable to connect. Please ensure the backend is running.",
          },
        ];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSourceClick = async (source: Source) => {
    setSelectedSource(source);

    if (source.chunk_id) {
      setIsLoadingContext(true);
      try {
        const response = await apiFetch(`/api/chunks/${source.chunk_id}?context_size=0`);
        if (response.ok) {
          const data = await response.json();
          setChunkContext(data);
        }
      } catch (error) {
        console.error("Failed to fetch chunk context:", error);
      } finally {
        setIsLoadingContext(false);
      }
    }
  };

  const closeSourceModal = () => {
    setSelectedSource(null);
    setChunkContext(null);
  };

  // Show loading state while chat history is loading
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <svg className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--bg-primary)" }}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <AnimatePresence>
        {showUploadModal && (
          <UploadModal
            onClose={() => setShowUploadModal(false)}
            onUpload={(file, projectId) => uploadFile(file, { projectId })}
          />
        )}
        {selectedSource && (
          <SourceModal
            source={selectedSource}
            chunkContext={chunkContext}
            isLoadingContext={isLoadingContext}
            onClose={closeSourceModal}
          />
        )}
      </AnimatePresence>

      <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} onUploadClick={() => setShowUploadModal(true)} />

      <BackendStatusBanner status={backendStatus} elapsedSeconds={elapsedSeconds} onRetry={retryBackend} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          onNewChat={() => createConversation()}
          onSelectConversation={selectConversation}
          onDeleteConversation={deleteConversation}
          onRenameConversation={renameConversation}
        />

        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          <ChatArea messages={messages} onSourceClick={handleSourceClick} />
          <ChatInput onSubmit={handleSubmitMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
