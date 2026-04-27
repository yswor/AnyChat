import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme(): Theme {
  return (localStorage.getItem("theme") as Theme) || "system";
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  resolvedTheme: getInitialTheme() === "system" ? getSystemTheme() : getInitialTheme() === "dark" ? "dark" : "light",
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    const resolved = theme === "system" ? getSystemTheme() : theme;
    set({ theme, resolvedTheme: resolved });
    document.documentElement.setAttribute("data-theme", resolved);
  },
}));

export function initTheme() {
  const store = useThemeStore.getState();
  const resolved = store.theme === "system" ? getSystemTheme() : store.theme;
  document.documentElement.setAttribute("data-theme", resolved);

  const listener = (e: MediaQueryListEvent) => {
    const currentTheme = useThemeStore.getState().theme;
    if (currentTheme === "system") {
      const newResolved = e.matches ? "dark" : "light";
      useThemeStore.setState({ resolvedTheme: newResolved });
      document.documentElement.setAttribute("data-theme", newResolved);
    }
  };
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", listener);
}
