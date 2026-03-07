"use client";

import { useSettings, FONT_FAMILY_OPTIONS, FONT_SIZE_OPTIONS, type FontFamily, type FontSize } from "@/contexts/SettingsContext";
import { Header } from "@/components/Header";

export default function SettingsPage() {
  const { fontFamily, fontSize, setFontFamily, setFontSize } = useSettings();

  return (
    <div className="h-screen overflow-y-auto" style={{ background: "var(--bg-deep)" }}>
      <Header />
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>

        {/* Reading Preferences */}
        <section
          className="mb-6 rounded-xl p-5"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Reading Preferences
          </h2>

          {/* Font Family */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Font Family
            </label>
            <div className="grid gap-2">
              {(Object.entries(FONT_FAMILY_OPTIONS) as [FontFamily, { label: string; css: string }][]).map(
                ([key, { label, css }]) => (
                  <button
                    key={key}
                    onClick={() => setFontFamily(key)}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm cursor-pointer"
                    style={{
                      background: fontFamily === key ? "var(--accent-subtle)" : "var(--bg-secondary)",
                      border: fontFamily === key ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                      color: "var(--text-primary)",
                      fontFamily: css,
                    }}
                  >
                    <span>{label}</span>
                    {fontFamily === key && (
                      <svg className="h-4 w-4" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="mb-2 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Font Size
            </label>
            <div className="flex gap-2">
              {(Object.entries(FONT_SIZE_OPTIONS) as [FontSize, { label: string; px: string }][]).map(
                ([key, { label }]) => (
                  <button
                    key={key}
                    onClick={() => setFontSize(key)}
                    className="flex-1 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer"
                    style={{
                      background: fontSize === key ? "var(--accent-subtle)" : "var(--bg-secondary)",
                      border: fontSize === key ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                      color: fontSize === key ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Live Preview */}
          <div className="mt-4 rounded-lg p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>Preview</p>
            <p style={{
              fontFamily: FONT_FAMILY_OPTIONS[fontFamily].css,
              fontSize: FONT_SIZE_OPTIONS[fontSize].px,
              lineHeight: "1.75",
              color: "var(--text-primary)",
            }}>
              The quick brown fox jumps over the lazy dog. Reading content will appear in this font and size across articles, chat messages, and documents.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
