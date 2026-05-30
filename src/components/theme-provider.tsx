"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  isThemeMode,
  nextThemeMode,
  resolveThemeMode,
  type ResolvedTheme,
  type ThemeMode,
  THEME_STORAGE_KEY,
  themeModeLabel,
} from "@/lib/theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "system";
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", update);

    return () => media.removeEventListener("change", update);
  }, []);

  const resolvedTheme = resolveThemeMode(mode, systemTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = resolvedTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }, [mode, resolvedTheme]);

  const value = useMemo(
    () => ({
      mode,
      resolvedTheme,
      toggleTheme: () => setMode((current) => nextThemeMode(current)),
    }),
    [mode, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function ThemeToggle() {
  const theme = useTheme();

  return (
    <button
      aria-label={`切换主题，当前为${themeModeLabel(theme.mode)}`}
      className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#cfd7d2] px-3 py-2 text-sm font-medium text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73]"
      data-testid="theme-toggle"
      onClick={theme.toggleTheme}
      type="button"
    >
      {theme.resolvedTheme === "dark" ? "深色" : "浅色"}
    </button>
  );
}

function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("ThemeToggle must be rendered inside ThemeProvider.");
  }

  return context;
}
