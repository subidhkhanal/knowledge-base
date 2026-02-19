"use client";

import { useState, useEffect, useRef } from "react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  /** CSS selector for the container holding the article HTML */
  containerSelector: string;
}

export function TableOfContents({ containerSelector }: TableOfContentsProps) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Parse headings from the rendered article HTML
  useEffect(() => {
    // Small delay to let article HTML render
    const timer = setTimeout(() => {
      const container = document.querySelector(containerSelector);
      if (!container) return;

      const headings = container.querySelectorAll("h2, h3");
      const tocItems: TocItem[] = [];

      headings.forEach((el, i) => {
        const id = el.id || `heading-${i}`;
        if (!el.id) el.id = id;
        tocItems.push({
          id,
          text: el.textContent?.trim() || "",
          level: el.tagName === "H2" ? 2 : 3,
        });
      });

      setItems(tocItems);
    }, 200);

    return () => clearTimeout(timer);
  }, [containerSelector]);

  // Observe headings for active state
  useEffect(() => {
    if (items.length === 0) return;

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [items]);

  // Don't render if fewer than 3 headings
  if (items.length < 3) return null;

  return (
    <nav className="space-y-1">
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-tertiary)" }}
      >
        Contents
      </p>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" });
          }}
          className="block truncate text-xs leading-relaxed transition-colors"
          style={{
            paddingLeft: item.level === 3 ? "12px" : "0",
            color: activeId === item.id ? "var(--accent)" : "var(--text-tertiary)",
            fontWeight: activeId === item.id ? 500 : 400,
          }}
        >
          {item.text}
        </a>
      ))}
    </nav>
  );
}
