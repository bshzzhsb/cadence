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
    <main className="desktop-only-notice">
      <div className="desktop-only-card">
        <p className="eyebrow">{APP_COPY.app.name}</p>
        <h1>{APP_COPY.desktopOnly.title}</h1>
        <p>{APP_COPY.desktopOnly.body}</p>
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
