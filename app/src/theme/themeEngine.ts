// ── Theme Engine ────────────────────────────────────────────────────
// Core types and runtime utilities for the custom theme system.

export interface ThemeColorPalette {
  bg: string;
  surface: string;
  primary: string;
  secondary: string;
  text: string;
  subtext: string;
  border: string;
  hover: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  isDark: boolean;
  palette: ThemeColorPalette;
  isBuiltin?: boolean;
}

const STYLE_ID = 'dynamic-theme';

/**
 * Inject a `<style>` block that overrides the @theme CSS variables,
 * and toggle the .dark/.light class on <html>.
 */
export function applyTheme(theme: CustomTheme): void {
  const root = document.documentElement;

  // Toggle dark/light class
  if (theme.isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }

  // Build CSS variable overrides.
  // We use :root.dark / :root.light (specificity 0,1,0) to match — and beat
  // (by document order) — the static :root.light block in App.css, which would
  // otherwise override a plain :root { } injection for all light-mode themes.
  const p = theme.palette;
  const modeClass = theme.isDark ? 'dark' : 'light';
  const css = `:root.${modeClass} {
  --color-telegram-bg: ${p.bg};
  --color-telegram-surface: ${p.surface};
  --color-telegram-primary: ${p.primary};
  --color-telegram-secondary: ${p.secondary};
  --color-telegram-text: ${p.text};
  --color-telegram-subtext: ${p.subtext};
  --color-telegram-border: ${p.border};
  --color-telegram-hover: ${p.hover};
  --color-telegram-glass-bg: ${p.surface};
  --color-telegram-glass-border: ${theme.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
}`;

  // Replace or create the style element
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

/**
 * Remove the injected style block so the base @theme values take effect.
 */
export function removeCustomTheme(): void {
  const el = document.getElementById(STYLE_ID);
  if (el) el.remove();
}

/** Generate a unique ID for user-created themes. */
export function generateThemeId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
