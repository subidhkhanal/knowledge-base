"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Conversation } from "@/types/chat";

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  /** When true, renders without the motion.aside wrapper — fills parent instead */
  embedded?: boolean;
}

function formatRelativeTime(timestamp: number) {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffHr < 48) return "Yesterday";
  return new Date(timestamp).toLocaleDateString();
}

function groupConversationsByDate(conversations: Conversation[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 7 * 86400000;

  const groups: { label: string; conversations: Conversation[] }[] = [];
  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const thisWeek: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const conv of conversations) {
    if (conv.updatedAt >= todayStart) today.push(conv);
    else if (conv.updatedAt >= yesterdayStart) yesterday.push(conv);
    else if (conv.updatedAt >= weekStart) thisWeek.push(conv);
    else earlier.push(conv);
  }

  if (today.length) groups.push({ label: "TODAY", conversations: today });
  if (yesterday.length) groups.push({ label: "YESTERDAY", conversations: yesterday });
  if (thisWeek.length) groups.push({ label: "THIS WEEK", conversations: thisWeek });
  if (earlier.length) groups.push({ label: "EARLIER", conversations: earlier });
  return groups;
}

export function Sidebar({
  conversations,
  currentConversationId,
  isOpen,
  onToggle,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  embedded,
}: SidebarProps) {
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const groups = groupConversationsByDate(filtered);

  const innerContent = (
        <div
          className={`flex h-full flex-col ${embedded ? "w-full" : "w-64"}`}
          style={{ background: "var(--bg-secondary)" }}
        >
          {/* Search Bar */}
          <div className="p-3">
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            >
              <svg
                className="h-4 w-4 flex-shrink-0"
                style={{ color: "var(--text-tertiary)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search threads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--text-primary)", border: "none", boxShadow: "none" }}
              />
            </div>
          </div>

          {/* New Thread Button */}
          <div className="px-3 pb-2">
            <button
              onClick={onNewChat}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-bg-hover"
              style={{ color: "var(--text-secondary)", border: "1px dashed var(--border)" }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Thread
            </button>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {groups.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {searchQuery ? "No matching threads" : "No conversations yet"}
                </p>
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <p
                    className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    <AnimatePresence>
                      {group.conversations.map((conv) => (
                        <motion.div
                          key={conv.id}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -12, height: 0 }}
                          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                          layout
                          className="group relative flex items-center rounded-lg px-3 py-2.5 cursor-pointer hover:bg-bg-hover"
                          onClick={() => onSelectConversation(conv.id)}
                          style={{
                            background: conv.id === currentConversationId ? "rgba(14, 165, 233, 0.08)" : "transparent",
                            borderLeft: conv.id === currentConversationId ? "3px solid var(--accent)" : "3px solid transparent",
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            {editingConversationId === conv.id ? (
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onBlur={() => {
                                  if (editingTitle.trim()) {
                                    onRenameConversation(conv.id, editingTitle);
                                  }
                                  setEditingConversationId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    if (editingTitle.trim()) {
                                      onRenameConversation(conv.id, editingTitle);
                                    }
                                    setEditingConversationId(null);
                                  } else if (e.key === "Escape") {
                                    setEditingConversationId(null);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                                className="w-full text-sm font-medium bg-transparent outline-none rounded px-1 -mx-1"
                                style={{
                                  color: "var(--text-primary)",
                                  border: "1px solid var(--accent)",
                                }}
                              />
                            ) : (
                              <p
                                className="text-sm font-medium truncate tracking-tight"
                                style={{
                                  color: conv.id === currentConversationId ? "var(--text-primary)" : "var(--text-secondary)",
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingConversationId(conv.id);
                                  setEditingTitle(conv.title);
                                }}
                                title="Double-click to rename"
                              >
                                {conv.title}
                              </p>
                            )}
                            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                              {formatRelativeTime(conv.updatedAt)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteConversation(conv.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded cursor-pointer"
                            style={{ color: "var(--text-tertiary)" }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--bg-tertiary)";
                              e.currentTarget.style.color = "var(--error)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--text-tertiary)";
                            }}
                            title="Delete conversation"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
  );

  if (embedded) return innerContent;

  return (
    <motion.aside
      animate={{ width: isOpen ? 256 : 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex-shrink-0 overflow-hidden"
      style={{ borderRight: isOpen ? "1px solid var(--border)" : "none" }}
    >
      {innerContent}
    </motion.aside>
  );
}
