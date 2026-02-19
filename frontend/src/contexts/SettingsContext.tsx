"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type FontFamily = "vollkorn" | "georgia" | "merriweather" | "lora" | "inter" | "system";
export type FontSize = "small" | "medium" | "large" | "xlarge";

interface SettingsState {
  fontFamily: FontFamily;
  fontSize: FontSize;
  setFontFamily: (f: FontFamily) => void;
  setFontSize: (s: FontSize) => void;
  isLoaded: boolean;
}

const SettingsContext = createContext<SettingsState | null>(null);

const STORAGE_KEYS = {
  fontFamily: "kb_font_family",
  fontSize: "kb_font_size",
} as const;

const DEFAULTS = {
  fontFamily: "vollkorn" as FontFamily,
  fontSize: "medium" as FontSize,
};

export const FONT_FAMILY_OPTIONS: Record<FontFamily, { label: string; css: string }> = {
  vollkorn:     { label: "Vollkorn",       css: "var(--font-vollkorn), Georgia, 'Times New Roman', serif" },
  georgia:      { label: "Georgia",        css: "Georgia, 'Times New Roman', serif" },
  merriweather: { label: "Merriweather",   css: "var(--font-merriweather), Georgia, 'Times New Roman', serif" },
  lora:         { label: "Lora",           css: "var(--font-lora), Georgia, 'Times New Roman', serif" },
  inter:        { label: "Inter",          css: "var(--font-inter), system-ui, -apple-system, sans-serif" },
  system:       { label: "System Default", css: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" },
};

export const FONT_SIZE_OPTIONS: Record<FontSize, { label: string; px: string }> = {
  small:  { label: "Small",       px: "14px" },
  medium: { label: "Medium",      px: "15px" },
  large:  { label: "Large",       px: "17px" },
  xlarge: { label: "Extra Large", px: "19px" },
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(DEFAULTS.fontFamily);
  const [fontSize, setFontSizeState] = useState<FontSize>(DEFAULTS.fontSize);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const storedFont = localStorage.getItem(STORAGE_KEYS.fontFamily) as FontFamily | null;
    const storedSize = localStorage.getItem(STORAGE_KEYS.fontSize) as FontSize | null;
    if (storedFont && storedFont in FONT_FAMILY_OPTIONS) setFontFamilyState(storedFont);
    if (storedSize && storedSize in FONT_SIZE_OPTIONS) setFontSizeState(storedSize);
    setIsLoaded(true);
  }, []);

  // Apply CSS custom properties whenever settings change
  useEffect(() => {
    if (!isLoaded) return;
    document.documentElement.style.setProperty("--font-reading", FONT_FAMILY_OPTIONS[fontFamily].css);
    document.documentElement.style.setProperty("--font-size-reading", FONT_SIZE_OPTIONS[fontSize].px);
  }, [fontFamily, fontSize, isLoaded]);

  const setFontFamily = useCallback((f: FontFamily) => {
    localStorage.setItem(STORAGE_KEYS.fontFamily, f);
    setFontFamilyState(f);
  }, []);

  const setFontSize = useCallback((s: FontSize) => {
    localStorage.setItem(STORAGE_KEYS.fontSize, s);
    setFontSizeState(s);
  }, []);

  return (
    <SettingsContext value={{ fontFamily, fontSize, setFontFamily, setFontSize, isLoaded }}>
      {children}
    </SettingsContext>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
