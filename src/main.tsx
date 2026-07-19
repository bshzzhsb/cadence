import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app";
import { SettingsWindow } from "./biz-components/settings-window";
import { ScreenshotSelectionWindow } from "./biz-components/screenshot-selection-window";
import { isTauriRuntime } from "@/lib/utils";
import "./app.css";

const windowKind = new URLSearchParams(window.location.search).get("window");

function DesktopOnlyNotice() {
  return (
    <main className="desktop-only-notice">
      <div className="desktop-only-card">
        <p className="eyebrow">Cadence</p>
        <h1>请使用 Cadence 桌面版</h1>
        <p>Cadence 的任务、设置和模型配置需要在 Tauri 桌面应用中运行。</p>
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
