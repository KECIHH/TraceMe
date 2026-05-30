export const THEME_STORAGE_KEY = "traceme.theme";

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
}

export function resolveThemeMode(
  preferred: ThemeMode,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  return preferred === "system" ? systemTheme : preferred;
}

export function nextThemeMode(current: ThemeMode): ThemeMode {
  if (current === "system") {
    return "light";
  }

  if (current === "light") {
    return "dark";
  }

  return "system";
}

export function themeModeLabel(mode: ThemeMode): string {
  if (mode === "dark") {
    return "深色";
  }

  if (mode === "light") {
    return "浅色";
  }

  return "跟随系统";
}
