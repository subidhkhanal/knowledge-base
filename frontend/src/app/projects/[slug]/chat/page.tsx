"use client";

import { use, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/useApi";
import { useProject } from "@/hooks/useProjects";
import { ChatArea } from "@/components/ChatArea";
import { ChatInput } from "@/components/ChatInput";
import type { Message, Source } from "@/types/chat";

function ProjectChatContent({ slug }: { slug: string }) {
  const { project, isLoading: projectLoading } = useProject(slug);
  const { apiFetch } = useApi();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const tokenQueueRef = useRef<
    { content: string; type: string; sources?: Source[]; provider?: string }[]
  >([]);
  const drainIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (drainIntervalRef.current) {
        clearInterval(drainIntervalRef.current);
      }
    };
  }, []);

  const startDraining = (assistantId: string) => {
    if (drainIntervalRef.current) return;

    drainIntervalRef.current = setInterval(() => {
      const queue = tokenQueueRef.current;
      if (queue.length === 0) return;

      const item = queue.shift()!;

      if (item.type === "token") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + item.content }
              : m
          )
        );
      } else if (item.type === "done") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, sources: item.sources, provider: item.provider }
              : m
          )
        );
        clearInterval(drainIntervalRef.current!);
        drainIntervalRef.current = null;
      }
    }, 30);
  };

  const handleSubmitMessage = async (inputText: string) => {
    if (isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputText,
    };

    const assistantId = (Date.now() + 1).toString();

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setIsLoading(true);

    try {
      const chatHistory = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await apiFetch(
        `/api/projects/${encodeURIComponent(slug)}/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: inputText,
            chat_history:
              chatHistory.length > 0 ? chatHistory : undefined,
          }),
        }
      );

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
                  if (word)
                    tokenQueueRef.current.push({
                      type: "token",
                      content: word,
                    });
                }
              } else {
                tokenQueueRef.current.push({
                  type: "token",
                  content: content,
                });
              }
              startDraining(assistantId);
            } else if (data.type === "done") {
              tokenQueueRef.current.push({
                type: "done",
                content: "",
                sources: data.sources,
                provider: data.provider,
              });
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
              ? {
                  ...m,
                  content:
                    m.content ||
                    "Unable to connect. Please ensure the backend is running.",
                }
              : m
          );
        }
        return [
          ...prev,
          {
            id: assistantId,
            role: "assistant" as const,
            content:
              "Unable to connect. Please ensure the backend is running.",
          },
        ];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSourceClick = (_source: Source) => {
    // No-op for project chat (could be expanded later)
  };

  if (projectLoading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: "var(--bg-primary)" }}
      >
        <svg
          className="h-8 w-8 animate-spin"
          style={{ color: "var(--accent)" }}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen flex-col"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Project chat header */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${slug}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ color: "var(--text-secondary)" }}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <div>
              <h1
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {project?.title || "Project Chat"}
              </h1>
              <p
                className="text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                Answers scoped to this project&apos;s content
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Chat content */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        <ChatArea messages={messages} onSourceClick={handleSourceClick} />
        <ChatInput onSubmit={handleSubmitMessage} isLoading={isLoading} />
      </div>
    </div>
  );
}

export default function ProjectChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ProjectChatContent slug={slug} />;
}
