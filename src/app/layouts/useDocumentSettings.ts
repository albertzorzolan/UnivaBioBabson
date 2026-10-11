// Applies the user's display settings to <html> so tokens.css can react:
//   data-theme="light|dark"  (settings.theme "system" follows the OS and updates live)
//   data-text-size="standard|large|extra"
// and keeps <meta name="theme-color"> in sync with the page background.
import { useLayoutEffect } from "react";
import { useStore } from "../StoreProvider";
import { useMediaQuery } from "../../ui/hooks";

const THEME_COLOR = { light: "#f7f5ef", dark: "#121815" } as const;

/** Resolve settings.theme to the theme actually shown. */
export function resolveTheme(theme: "light" | "dark" | "system", prefersDark: boolean): "light" | "dark" {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

/** Mirror settings.theme / settings.textSize onto <html>. Call once near the root (App does). */
export function useDocumentSettings(): void {
  const { data } = useStore();
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = resolveTheme(data.settings.theme, prefersDark);
  const textSize = data.settings.textSize;

  // Layout effect: apply before paint so there is no flash of the wrong theme.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.textSize = textSize;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.content = THEME_COLOR[theme];
      m.removeAttribute("media");
    });
  }, [theme, textSize]);
}

/** Mark <html> with the active shell (data-shell="patient" raises the base font to 20px). */
export function useShellAttribute(shell: "patient" | "caregiver" | "public"): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.shell = shell;
    return () => {
      if (root.dataset.shell === shell) delete root.dataset.shell;
    };
  }, [shell]);
}
