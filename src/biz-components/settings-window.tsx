import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, LoaderCircle, Settings, SlidersHorizontal, Sparkles } from "lucide-react";
import { beginLarkOAuth, getSettings, saveSettings } from "@/lib/api";
import { APP_COPY } from "@/lib/copy";
import { defaultSettings, type AppSettings } from "@/lib/types";
import { applyTheme, cn } from "@/lib/utils";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const settingsTabs = [
  { id: "basic", label: APP_COPY.settings.tabs.basic.label, description: APP_COPY.settings.tabs.basic.description, icon: SlidersHorizontal },
  { id: "ai", label: APP_COPY.settings.tabs.ai.label, description: APP_COPY.settings.tabs.ai.description, icon: Sparkles },
  { id: "lark", label: APP_COPY.settings.tabs.lark.label, description: APP_COPY.settings.tabs.lark.description, icon: Cloud },
] as const;

type SettingsTabId = (typeof settingsTabs)[number]["id"];

const settingsControlClassName = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-cadence-settings-focus disabled:cursor-not-allowed disabled:opacity-50";

function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SettingsField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block w-full space-y-1", className)}>
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function SettingsRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="w-auto shrink-0">{children}</div>
    </div>
  );
}

function SettingsSwitch({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="min-w-0 space-y-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={label}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}

export function SettingsWindow() {
  const [form, setForm] = useState<AppSettings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("basic");
  const [aiKey, setAiKey] = useState("");
  const [larkSecret, setLarkSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeTabConfig = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0];
  const PanelIcon = activeTabConfig.icon;

  useEffect(() => {
    void getSettings().then((value) => {
      setForm(value);
      applyTheme();
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
    applyTheme();
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
    <main className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <form className="flex h-full w-full flex-col" onSubmit={submit}>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTabId)}
          orientation="vertical"
          className="flex min-h-0 flex-1"
        >
          <aside className="relative flex h-full w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-card px-4 py-5 before:pointer-events-none before:absolute before:inset-0 before:bg-cadence-settings-sidebar before:content-['']">
            <div className="relative z-[1] mb-4 px-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                <Settings size={14} aria-hidden="true" />
                <span>{APP_COPY.app.name}</span>
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{APP_COPY.settings.heading}</h1>
            </div>

            <TabsList aria-label={APP_COPY.settings.tabListLabel} className="relative z-[1] flex min-h-0 w-full flex-1 flex-col items-stretch justify-start gap-1 overflow-y-auto rounded-none bg-transparent p-0">
              {settingsTabs.map((tab) => {
                const TabIcon = tab.icon;

                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className={cn(
                      "group flex h-10 w-full flex-none justify-start gap-2 rounded-md border-0 px-2.5 py-1.5 text-left text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground data-active:bg-accent data-active:text-accent-foreground data-active:shadow-none",
                      activeTab === tab.id && "bg-accent text-accent-foreground shadow-none",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground group-data-active:bg-background/70 group-data-active:text-primary group-hover:text-foreground",
                        activeTab === tab.id && "bg-background/70 text-primary",
                      )}
                    >
                      <TabIcon size={18} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="truncate">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-border px-5 py-4">
              <div className="mx-auto flex max-w-2xl items-start gap-2.5">
                <PanelIcon className="mt-1 shrink-0 text-primary" size={20} strokeWidth={1.8} aria-hidden="true" />
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">{activeTabConfig.label}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeTabConfig.description}</p>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
              {settingsTabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id} className="mx-auto mt-0 max-w-2xl space-y-8 pb-2 focus:outline-none data-[state=active]:animate-cadence-fade-up">
                {tab.id === "basic" && (
                  <>
                    <SettingsSection
                      title={APP_COPY.settings.groups.basicDefaults.title}
                      description={APP_COPY.settings.groups.basicDefaults.description}
                    >
                      <div className="space-y-4">
                        <SettingsRow label={APP_COPY.settings.fields.defaultDueHour.label}>
                          <Input
                            type="number"
                            min="0"
                            max="23"
                            aria-label={APP_COPY.settings.fields.defaultDueHour.label}
                            value={form.defaultDueHour}
                            onChange={(event) => field("defaultDueHour", Number(event.target.value))}
                            className={cn(settingsControlClassName, "w-56")}
                          />
                        </SettingsRow>
                      </div>
                    </SettingsSection>

                    <SettingsSection
                      title={APP_COPY.settings.groups.weekly.title}
                      description={APP_COPY.settings.groups.weekly.description}
                    >
                      <SettingsSwitch
                        label={APP_COPY.settings.fields.weeklyEnabled.label}
                        description={APP_COPY.settings.fields.weeklyEnabled.description}
                        checked={form.weeklyEnabled}
                        onChange={(checked) => field("weeklyEnabled", checked)}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <SettingsField label={APP_COPY.settings.fields.weeklyDay.label}>
                          <select
                            aria-label={APP_COPY.settings.fields.weeklyDay.label}
                            value={form.weeklyDay}
                            onChange={(event) => field("weeklyDay", Number(event.target.value))}
                            className={settingsControlClassName}
                          >
                            {APP_COPY.settings.options.weekdays.map((weekday, index) => <option key={weekday} value={index}>{weekday}</option>)}
                          </select>
                        </SettingsField>
                        <SettingsField label={APP_COPY.settings.fields.weeklyTime.label}>
                          <Input
                            type="time"
                            value={form.weeklyTime}
                            onChange={(event) => field("weeklyTime", event.target.value)}
                            className={settingsControlClassName}
                          />
                        </SettingsField>
                      </div>
                    </SettingsSection>
                  </>
                )}

                {tab.id === "ai" && (
                  <>
                    <SettingsSection
                      title={APP_COPY.settings.groups.aiConnection.title}
                      description={APP_COPY.settings.groups.aiConnection.description}
                    >
                      <SettingsField label={APP_COPY.settings.fields.aiBaseUrl.label} className="max-w-2xl">
                        <Input
                          value={form.aiBaseUrl}
                          onChange={(event) => field("aiBaseUrl", event.target.value)}
                          placeholder={APP_COPY.settings.fields.aiBaseUrl.placeholder}
                          className={settingsControlClassName}
                        />
                      </SettingsField>
                      <SettingsField label={APP_COPY.settings.fields.aiKey.label} className="max-w-2xl">
                        <Input
                          type="password"
                          value={aiKey}
                          onChange={(event) => setAiKey(event.target.value)}
                          placeholder={APP_COPY.settings.fields.aiKey.placeholder}
                          className={settingsControlClassName}
                        />
                      </SettingsField>
                    </SettingsSection>

                    <SettingsSection
                      title={APP_COPY.settings.groups.aiModels.title}
                      description={APP_COPY.settings.groups.aiModels.description}
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <SettingsField label={APP_COPY.settings.fields.aiTextModel.label}>
                          <Input
                            value={form.aiTextModel}
                            onChange={(event) => field("aiTextModel", event.target.value)}
                            placeholder={APP_COPY.settings.fields.aiTextModel.placeholder}
                            className={settingsControlClassName}
                          />
                        </SettingsField>
                        <SettingsField label={APP_COPY.settings.fields.aiVisionModel.label}>
                          <Input
                            value={form.aiVisionModel}
                            onChange={(event) => field("aiVisionModel", event.target.value)}
                            placeholder={APP_COPY.settings.fields.aiVisionModel.placeholder}
                            className={settingsControlClassName}
                          />
                        </SettingsField>
                      </div>
                    </SettingsSection>
                  </>
                )}

                {tab.id === "lark" && (
                  <>
                    <SettingsSection
                      title={APP_COPY.settings.groups.larkAuth.title}
                      description={APP_COPY.settings.groups.larkAuth.description}
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <SettingsField label={APP_COPY.settings.fields.larkAppId.label}>
                          <Input
                            value={form.larkAppId}
                            onChange={(event) => field("larkAppId", event.target.value)}
                            className={settingsControlClassName}
                          />
                        </SettingsField>
                        <SettingsField label={APP_COPY.settings.fields.larkSecret.label}>
                          <Input
                            type="password"
                            value={larkSecret}
                            onChange={(event) => setLarkSecret(event.target.value)}
                            placeholder={APP_COPY.settings.fields.larkSecret.placeholder}
                            className={settingsControlClassName}
                          />
                        </SettingsField>
                      </div>
                    </SettingsSection>

                    <SettingsSection
                      title={APP_COPY.settings.groups.larkTargets.title}
                      description={APP_COPY.settings.groups.larkTargets.description}
                    >
                      <SettingsField label={APP_COPY.settings.fields.larkBaseUrl.label} className="max-w-2xl">
                        <Input
                          value={form.larkBaseUrl}
                          onChange={(event) => field("larkBaseUrl", event.target.value)}
                          placeholder={APP_COPY.settings.fields.larkBaseUrl.placeholder}
                          className={settingsControlClassName}
                        />
                      </SettingsField>
                      <SettingsField label={APP_COPY.settings.fields.larkDocumentUrl.label} className="max-w-2xl">
                        <Input
                          value={form.larkDocumentUrl}
                          onChange={(event) => field("larkDocumentUrl", event.target.value)}
                          className={settingsControlClassName}
                        />
                      </SettingsField>
                      <div className="pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={connecting || !form.larkAppId || !form.larkBaseUrl}
                          onClick={async () => {
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
                          }}
                          className="h-9 rounded-md px-3"
                        >
                          {connecting && <LoaderCircle size={15} className="animate-spin" />}
                          {connecting ? APP_COPY.settings.actions.waitingAuth : APP_COPY.settings.actions.saveAndConnectLark}
                        </Button>
                      </div>
                    </SettingsSection>
                  </>
                )}
                </TabsContent>
              ))}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background px-5 py-3">
              <div className="min-w-0">
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              </div>
              <Button type="submit" className="h-9 shrink-0 rounded-md px-3">
                <CheckCircle2 size={16} />
                {APP_COPY.settings.actions.save}
              </Button>
            </footer>
          </div>
        </Tabs>
      </form>
      <div className="sr-only" aria-live="polite">{message}</div>
      {message && <div className="fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-xl border border-border bg-foreground px-3 py-2 text-xs text-background shadow-xl" role="status"><CheckCircle2 size={16} />{message}</div>}
    </main>
  );
}
