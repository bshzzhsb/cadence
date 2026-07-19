import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Settings } from "lucide-react";
import { beginLarkOAuth, getSettings, saveSettings } from "@/lib/api";
import { defaultSettings, type AppSettings } from "@/lib/types";
import { applyTheme } from "@/lib/utils";
import { Button } from "@/components/button";
import { Input } from "@/components/input";

export function SettingsWindow() {
  const [form, setForm] = useState<AppSettings>(defaultSettings);
  const [aiKey, setAiKey] = useState("");
  const [larkSecret, setLarkSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    announce("设置已保存");
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
      <header className="settings-heading">
        <div className="settings-icon"><Settings size={19} /></div>
        <div><p className="eyebrow">Cadence</p><h1>设置</h1><p>普通设置保存在本地 SQLite；API Key 和飞书凭证保存在系统密钥库。</p></div>
      </header>
      <form className="settings-grid" onSubmit={submit}>
        <fieldset className="settings-card">
          <legend>基础偏好</legend>
          <label>默认截止小时<Input type="number" min="0" max="23" value={form.defaultDueHour} onChange={(event) => field("defaultDueHour", Number(event.target.value))} /></label>
          <label>主题<select value={form.theme} onChange={(event) => field("theme", event.target.value)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
          <label className="switch-label"><span>自动生成周总结<small>Cadence 在后台运行时，到设定时间自动生成。</small></span><input type="checkbox" checked={form.weeklyEnabled} onChange={(event) => field("weeklyEnabled", event.target.checked)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label>生成星期<select value={form.weeklyDay} onChange={(event) => field("weeklyDay", Number(event.target.value))}><option value="0">周日</option><option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option></select></label>
            <label>生成时间<Input type="time" value={form.weeklyTime} onChange={(event) => field("weeklyTime", event.target.value)} /></label>
          </div>
        </fieldset>
        <fieldset className="settings-card">
          <legend>AI 服务</legend>
          <label>服务地址<Input value={form.aiBaseUrl} onChange={(event) => field("aiBaseUrl", event.target.value)} placeholder="https://.../v1" /></label>
          <label>API Key<Input type="password" value={aiKey} onChange={(event) => setAiKey(event.target.value)} placeholder="留空表示不修改" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label>文本模型<Input value={form.aiTextModel} onChange={(event) => field("aiTextModel", event.target.value)} placeholder="mimo-v2.5" /></label>
            <label>视觉模型<Input value={form.aiVisionModel} onChange={(event) => field("aiVisionModel", event.target.value)} placeholder="mimo-v2.5" /></label>
          </div>
          <p>文本和图片识别可以使用不同模型；默认模型为 <strong>mimo-v2.5</strong>。</p>
        </fieldset>
        <fieldset className="settings-card settings-card-wide">
          <legend>飞书同步</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label>App ID<Input value={form.larkAppId} onChange={(event) => field("larkAppId", event.target.value)} /></label>
            <label>App Secret<Input type="password" value={larkSecret} onChange={(event) => setLarkSecret(event.target.value)} placeholder="留空表示不修改" /></label>
            <label>多维表格链接<Input value={form.larkBaseUrl} onChange={(event) => field("larkBaseUrl", event.target.value)} placeholder="https://.../base/...?...table=..." /></label>
            <label>周总结文档链接<Input value={form.larkDocumentUrl} onChange={(event) => field("larkDocumentUrl", event.target.value)} /></label>
          </div>
          <div className="settings-connect-row">
            <p>MVP 使用单向同步：Cadence 是任务事实来源，不覆盖本地数据。</p>
            <Button type="button" variant="outline" disabled={connecting || !form.larkAppId || !form.larkBaseUrl} onClick={async () => {
              setConnecting(true);
              setError("");
              try {
                await save();
                await beginLarkOAuth();
                announce("飞书已连接");
              } catch (connectError) {
                setError(String(connectError));
              } finally {
                setConnecting(false);
              }
            }}>{connecting && <LoaderCircle size={15} className="animate-spin" />}{connecting ? "等待授权" : "保存并连接飞书"}</Button>
          </div>
          {error && <p className="settings-error" role="alert">{error}</p>}
        </fieldset>
        <footer className="settings-footer"><Button type="submit">保存设置</Button></footer>
      </form>
      <div className="sr-only" aria-live="polite">{message}</div>
      {message && <div className="toast" role="status"><CheckCircle2 size={16} />{message}</div>}
    </main>
  );
}
