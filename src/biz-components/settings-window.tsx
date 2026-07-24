import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Settings } from "lucide-react";
import { beginLarkOAuth, getSettings, saveSettings } from "@/lib/api";
import { APP_COPY } from "@/lib/copy";
import { defaultSettings, type AppSettings } from "@/lib/types";
import { applyTheme } from "@/lib/utils";
import { Button } from "@/components/button";
import { Input } from "@/components/input";

type SettingsTabId = "basic" | "ai" | "lark";

const settingsTabs: Array<{ id: SettingsTabId; label: string; description: string }> = [
  { id: "basic", label: APP_COPY.settings.tabs.basic.label, description: APP_COPY.settings.tabs.basic.description },
  { id: "ai", label: APP_COPY.settings.tabs.ai.label, description: APP_COPY.settings.tabs.ai.description },
  { id: "lark", label: APP_COPY.settings.tabs.lark.label, description: APP_COPY.settings.tabs.lark.description },
];

export function SettingsWindow() {
  const [form, setForm] = useState<AppSettings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("basic");
  const [aiKey, setAiKey] = useState("");
  const [larkSecret, setLarkSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeTabConfig = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0];

  useEffect(() => {
    void getSettings().then((value) => {
      setForm(value);
      applyTheme(value.theme);
    });
  }, []);

  const announce = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2600);
  };

  const field = (key: keyof AppSettings, next: string | number | boolean) => {
    setForm((current) => ({ ...current, [key]: next }));
  };

  const save = async () => {
    await saveSettings(form, { aiKey: aiKey || undefined, larkSecret: larkSecret || undefined });
    setAiKey("");
    setLarkSecret("");
    applyTheme(form.theme);
    announce(APP_COPY.settings.toast.saved);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await save();
    } catch (saveError) {
      setError(String(saveError));
    }
  };

  return (
    <main className="settings-window">
      <form className="settings-shell" onSubmit={submit}>
        <header className="settings-heading">
          <div className="settings-icon"><Settings size={19} /></div>
          <div><p className="eyebrow">{APP_COPY.app.name}</p><h1>{APP_COPY.settings.heading}</h1></div>
        </header>

        <div className="settings-body">
          <nav className="settings-tabs" role="tablist" aria-label={APP_COPY.settings.tabListLabel}>
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`settings-panel-${tab.id}`}
                className={`settings-tab ${activeTab === tab.id ? "settings-tab-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                <small>{tab.description}</small>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            <section
              id={`settings-panel-${activeTab}`}
              className="settings-section settings-tab-panel"
              role="tabpanel"
              aria-labelledby={`settings-tab-${activeTab}`}
              tabIndex={0}
            >
              <h2>{activeTabConfig.label}</h2>

              {activeTab === "basic" && (
                <div className="settings-fields">
                  <label>{APP_COPY.settings.fields.defaultDueHour.label}<Input type="number" min="0" max="23" value={form.defaultDueHour} onChange={(event) => field("defaultDueHour", Number(event.target.value))} /></label>
                  <label>{APP_COPY.settings.fields.theme.label}<select value={form.theme} onChange={(event) => field("theme", event.target.value)}><option value="system">{APP_COPY.settings.options.theme.system}</option><option value="light">{APP_COPY.settings.options.theme.light}</option><option value="dark">{APP_COPY.settings.options.theme.dark}</option></select></label>
                  <label className="switch-label"><span>{APP_COPY.settings.fields.weeklyEnabled.label}</span><input type="checkbox" checked={form.weeklyEnabled} onChange={(event) => field("weeklyEnabled", event.target.checked)} /></label>
                  <label>{APP_COPY.settings.fields.weeklyDay.label}<select value={form.weeklyDay} onChange={(event) => field("weeklyDay", Number(event.target.value))}>{APP_COPY.settings.options.weekdays.map((weekday, index) => <option key={weekday} value={index}>{weekday}</option>)}</select></label>
                  <label>{APP_COPY.settings.fields.weeklyTime.label}<Input type="time" value={form.weeklyTime} onChange={(event) => field("weeklyTime", event.target.value)} /></label>
                </div>
              )}

              {activeTab === "ai" && (
                <div className="settings-fields">
                  <label>{APP_COPY.settings.fields.aiBaseUrl.label}<Input value={form.aiBaseUrl} onChange={(event) => field("aiBaseUrl", event.target.value)} placeholder={APP_COPY.settings.fields.aiBaseUrl.placeholder} /></label>
                  <label>{APP_COPY.settings.fields.aiKey.label}<Input type="password" value={aiKey} onChange={(event) => setAiKey(event.target.value)} placeholder={APP_COPY.settings.fields.aiKey.placeholder} /></label>
                  <label>{APP_COPY.settings.fields.aiTextModel.label}<Input value={form.aiTextModel} onChange={(event) => field("aiTextModel", event.target.value)} placeholder={APP_COPY.settings.fields.aiTextModel.placeholder} /></label>
                  <label>{APP_COPY.settings.fields.aiVisionModel.label}<Input value={form.aiVisionModel} onChange={(event) => field("aiVisionModel", event.target.value)} placeholder={APP_COPY.settings.fields.aiVisionModel.placeholder} /></label>
                </div>
              )}

              {activeTab === "lark" && (
                <>
                  <div className="settings-fields">
                    <label>{APP_COPY.settings.fields.larkAppId.label}<Input value={form.larkAppId} onChange={(event) => field("larkAppId", event.target.value)} /></label>
                    <label>{APP_COPY.settings.fields.larkSecret.label}<Input type="password" value={larkSecret} onChange={(event) => setLarkSecret(event.target.value)} placeholder={APP_COPY.settings.fields.larkSecret.placeholder} /></label>
                    <label>{APP_COPY.settings.fields.larkBaseUrl.label}<Input value={form.larkBaseUrl} onChange={(event) => field("larkBaseUrl", event.target.value)} placeholder={APP_COPY.settings.fields.larkBaseUrl.placeholder} /></label>
                    <label>{APP_COPY.settings.fields.larkDocumentUrl.label}<Input value={form.larkDocumentUrl} onChange={(event) => field("larkDocumentUrl", event.target.value)} /></label>
                  </div>
                  <div className="settings-connect-row">
                    <Button type="button" variant="outline" disabled={connecting || !form.larkAppId || !form.larkBaseUrl} onClick={async () => {
                      setConnecting(true);
                      setError("");
                      try {
                        await save();
                        await beginLarkOAuth();
                        announce(APP_COPY.settings.toast.larkConnected);
                      } catch (connectError) {
                        setError(String(connectError));
                      } finally {
                        setConnecting(false);
                      }
                    }}>{connecting && <LoaderCircle size={15} className="animate-spin" />}{connecting ? APP_COPY.settings.actions.waitingAuth : APP_COPY.settings.actions.saveAndConnectLark}</Button>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        <footer className="settings-footer">
          {error && <p className="settings-error" role="alert">{error}</p>}
          <Button type="submit">{APP_COPY.settings.actions.save}</Button>
        </footer>
      </form>
      <div className="sr-only" aria-live="polite">{message}</div>
      {message && <div className="toast" role="status"><CheckCircle2 size={16} />{message}</div>}
    </main>
  );
}
