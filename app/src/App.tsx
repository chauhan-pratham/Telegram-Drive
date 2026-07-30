import React, { useState, useEffect, Suspense, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { load } from "@tauri-apps/plugin-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthWizard } from "./components/shared/AuthWizard";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { UpdateBanner } from "./components/shared/UpdateBanner";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { usePlatform } from "./hooks/usePlatform";
import "./App.css";

const DesktopDashboard = React.lazy(() => import("./components/desktop/DesktopDashboard").then(m => ({ default: m.Dashboard })));
// Vite requires a fully static import path for dynamic imports so it can
// perform static analysis and code-splitting. Template literals with
// variables prevent Vite from resolving the module at build time.
const MobileDashboard = React.lazy(() => import("./components/mobile/MobileDashboard.tsx"));

import { Toaster, toast } from "sonner";
import { ConfirmProvider } from "./context/ConfirmContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { DriveProvider } from "./context/DriveContext";

const queryClient = new QueryClient();

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

function AppContent() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const { theme } = useTheme();
  const { available, version, downloading, progress, downloadAndInstall, dismissUpdate } = useUpdateCheck();
  const { isMobile } = usePlatform();
  const { settings, updateSetting, isLoaded } = useSettings();

  useEffect(() => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  }, []);

  const zoomRef = useRef<number>(1.0);

  useEffect(() => {
    const logFrontendError = (message: string) => {
      invoke("cmd_log_error", { message: message.slice(0, 8_000) }).catch(() => {});
    };

    const handleWindowError = (event: ErrorEvent) => {
      const location = event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : "unknown location";
      const stack = event.error instanceof Error ? `\n${event.error.stack ?? ""}` : "";
      logFrontendError(`[window.error] ${event.message} at ${location}${stack}`);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error
        ? `${event.reason.message}\n${event.reason.stack ?? ""}`
        : String(event.reason);
      logFrontendError(`[window.unhandledrejection] ${reason}`);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  // Initialize zoom factor from persistent store on mount
  useEffect(() => {
    try {
      const savedZoom = localStorage.getItem("app-zoom-factor");
      if (savedZoom) {
        const factor = parseFloat(savedZoom);
        if (!isNaN(factor) && factor >= 0.5 && factor <= 2.0) {
          zoomRef.current = factor;
          getCurrentWebview().setZoom(factor).catch(() => {});
        }
      }
    } catch (e) {
      console.error("Failed to restore zoom factor:", e);
    }
  }, []);

  const adjustZoom = useCallback((delta: number) => {
    const nextZoom = Math.min(2.0, Math.max(0.5, parseFloat((zoomRef.current + delta).toFixed(1))));
    if (nextZoom !== zoomRef.current) {
      zoomRef.current = nextZoom;
      try {
        localStorage.setItem("app-zoom-factor", nextZoom.toString());
      } catch {}
      getCurrentWebview().setZoom(nextZoom).catch((e) => {
        console.error("Failed to set zoom factor:", e);
      });
    }
  }, []);

  const resetZoom = useCallback(() => {
    if (zoomRef.current !== 1.0) {
      zoomRef.current = 1.0;
      try {
        localStorage.setItem("app-zoom-factor", "1.0");
      } catch {}
      getCurrentWebview().setZoom(1.0).catch((e) => {
        console.error("Failed to reset zoom factor:", e);
      });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod) {
        if (e.code === "Equal" || e.code === "NumpadAdd" || e.key === "+") {
          e.preventDefault();
          adjustZoom(0.1);
        } else if (e.code === "Minus" || e.code === "NumpadSubtract" || e.key === "-") {
          e.preventDefault();
          adjustZoom(-0.1);
        } else if (e.key === "0") {
          e.preventDefault();
          resetZoom();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [adjustZoom, resetZoom]);

  // Enforce English language and LTR direction statically
  useEffect(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  }, []);

  // Performance mode: auto-enable when user has prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches && !settings.performanceMode) {
      updateSetting('performanceMode', true);
    }
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && !settings.performanceMode) {
        updateSetting('performanceMode', true);
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Apply performance-mode class to body (guarded by settings load to avoid flicker)
  useEffect(() => {
    if (!isLoaded) return;
    if (settings.performanceMode) {
      document.body.classList.add('performance-mode');
    } else {
      document.body.classList.remove('performance-mode');
    }
  }, [settings.performanceMode, isLoaded]);

  // On mount: check for a saved session and auto-restore it.
  // This is the SINGLE source of truth for the initial connection.
  // useTelegramConnection (inside Dashboard) no longer calls cmd_connect on mount.
  useEffect(() => {
    const checkSession = async () => {
      try {
        const store = await load("config.json");
        const savedId = await store.get<string>("api_id");

        if (!savedId) {
          setAuthStatus("unauthenticated");
          return;
        }

        const apiId = parseInt(savedId, 10);
        if (isNaN(apiId)) {
          setAuthStatus("unauthenticated");
          return;
        }

        // Initialize the client with the saved API ID
        await invoke("cmd_connect", { apiId });

        // Verify the session is still valid with Telegram servers
        const ok = await invoke<boolean>("cmd_check_connection");
        if (ok) {
          setAuthStatus("authenticated");
        } else {
          setAuthStatus("unauthenticated");
        }
      } catch (err) {
        console.warn("Session restore failed, showing login:", err);
        setAuthStatus("unauthenticated");
      }
    };

    checkSession();
  }, []);

  // Show thank-you toast when user enters the app after clicking the ad
  useEffect(() => {
    if (authStatus !== "authenticated") return;

    const showThanks = async () => {
      try {
        const store = await load("config.json");
        const shouldThank = await store.get<boolean>("ad_click_thanks");
        if (shouldThank) {
          await store.delete("ad_click_thanks");
          await store.save();
          toast.success("Thanks for your support! ", {
            duration: 3000,
            style: {
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
            },
          });
        }
      } catch {
        // Non-critical
      }
    };

    // Small delay to let the dashboard finish mounting
    const timer = setTimeout(showThanks, 600);
    return () => clearTimeout(timer);
  }, [authStatus]);

  // Clean up PDF preview cache files on close/beforeunload
  useEffect(() => {
    const handleClose = () => {
      invoke("cmd_clean_preview_cache").catch(() => {});
    };

    window.addEventListener("beforeunload", handleClose);
    return () => {
      window.removeEventListener("beforeunload", handleClose);
      handleClose();
    };
  }, []);

  // Styled splash screen while verifying the session
  if (authStatus === "loading") {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-telegram-bg">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.svg?v=2" className="w-16 h-16 drop-shadow-lg animate-pulse" alt="Telegram Drive" />
          <p className="text-sm text-telegram-subtext tracking-wide">Restoring session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="absolute inset-0 text-telegram-text overflow-hidden selection:bg-telegram-primary/30">
      <UpdateBanner
        available={available}
        version={version}
        downloading={downloading}
        progress={progress}
        onUpdate={downloadAndInstall}
        onDismiss={dismissUpdate}
      />
      <Toaster theme={theme} position="bottom-center" />
      {authStatus === "authenticated" && (
        <Suspense fallback={
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-telegram-bg">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-telegram-primary"></div>
          </div>
        }>
          <DriveProvider>
            {isMobile ? (
              <ErrorBoundary>
                <MobileDashboard onLogout={() => setAuthStatus("unauthenticated")} />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary>
                <DesktopDashboard onLogout={() => setAuthStatus("unauthenticated")} />
              </ErrorBoundary>
            )}
          </DriveProvider>
        </Suspense>
      )}
      {authStatus === "unauthenticated" && (
        <AuthWizard onLogin={() => setAuthStatus("authenticated")} />
      )}
    </main>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ConfirmProvider>
            <SettingsProvider>
              <AppContent />
            </SettingsProvider>
          </ConfirmProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
