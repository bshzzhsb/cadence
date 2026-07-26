import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app";
import { SettingsWindow } from "./biz-components/settings-window";
import { ScreenshotSelectionWindow } from "./biz-components/screenshot-selection-window";
import { APP_COPY } from "@/lib/copy";
import { isTauriRuntime } from "@/lib/utils";
import "./app.css";

const windowKind = new URLSearchParams(window.location.search).get("window");

function DesktopOnlyNotice() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-[min(420px,100%)] rounded-[18px] border border-border bg-card p-7 shadow-cadence-desktop">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{APP_COPY.app.name}</p>
        <h1 className="mt-2 font-serif text-2xl font-semibold">{APP_COPY.desktopOnly.title}</h1>
        <p className="mt-2.5 text-[13px] leading-[1.6] text-muted-foreground">{APP_COPY.desktopOnly.body}</p>
      </div>
    </main>
  );
}

const content = !isTauriRuntime()
  ? <DesktopOnlyNotice />
  : windowKind === "settings"
    ? <SettingsWindow />
    : windowKind === "screenshot"
      ? <ScreenshotSelectionWindow />
      : <App />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {content}
  </React.StrictMode>,
);
