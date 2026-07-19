import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  History,
  LayoutList,
  LoaderCircle,
  Search,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  completeTask,
  deleteTask,
  generateWeeklyReport,
  getSettings,
  hideCaptureWindow,
  listTasks,
  listWeeklyReports,
  readClipboardPayload,
  reopenTask,
  scheduleImageRecognition,
  scheduleManualRecognition,
  scheduleTextRecognition,
  setCaptureWindowMode,
  startScreenshotSelection,
} from "@/lib/api";
import {
  type AppSettings,
  type CaptureWindowMode,
  type Task,
  type TaskViewId,
  type ViewId,
  type WeeklyReport,
} from "@/lib/types";
import { groupFutureTasks } from "@/lib/task-groups";
import { applyTheme, cn, isTauriRuntime } from "@/lib/utils";
import { Button } from "@/components/button";
import { TaskItem } from "@/biz-components/task-item";
import cadenceLogo from "@/assets/cadence-logo-ui.png";

const tabs: Array<{ id: ViewId; label: string; icon: typeof CalendarDays }> = [
  { id: "future", label: "未来", icon: CalendarDays },
  { id: "history", label: "历史", icon: History },
  { id: "weekly", label: "周总结", icon: LayoutList },
];

interface ClipboardCandidate {
  type: "text" | "image";
  content: string;
}

export default function App() {
  const [mode, setMode] = useState<CaptureWindowMode>("compact");
  const [tab, setTab] = useState<ViewId>("future");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [currentReport, setCurrentReport] = useState<WeeklyReport | null>(null);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [clipboardCandidate, setClipboardCandidate] = useState<ClipboardCandidate | null>(null);
  const [laterExpanded, setLaterExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const announce = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2600);
  }, []);

  const refreshTasks = useCallback(async (view: TaskViewId) => {
    setTasks(await listTasks(view));
  }, []);

  const setWindowMode = useCallback(async (next: CaptureWindowMode) => {
    setMode(next);
    try {
      await setCaptureWindowMode(next);
    } catch (error) {
      announce(String(error));
    }
  }, [announce]);

  const openPanel = useCallback(async () => {
    setTab("future");
    setSearch("");
    setLaterExpanded(false);
    await setWindowMode("panel");
  }, [setWindowMode]);

  const closePanel = useCallback(async () => {
    setSearch("");
    await setWindowMode("compact");
  }, [setWindowMode]);

  const hideWindow = useCallback(async () => {
    setMode("compact");
    setClipboardCandidate(null);
    setSearch("");
    try {
      await hideCaptureWindow();
    } catch (error) {
      announce(String(error));
    }
  }, [announce]);

  useEffect(() => {
    void getSettings().then((value) => applyTheme(value.theme));
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let removeModeListener: (() => void) | undefined;
    let removeSettingsListener: (() => void) | undefined;
    let removeRecognitionListener: (() => void) | undefined;
    let removeRecognitionErrorListener: (() => void) | undefined;

    void listen<CaptureWindowMode>("capture:mode", ({ payload }) => {
      setMode(payload);
      if (payload === "panel") {
        setTab("future");
        setSearch("");
        setLaterExpanded(false);
      }
      if (payload === "compact") {
        setClipboardCandidate(null);
      }
    }).then((unlisten) => {
      removeModeListener = unlisten;
    });

    void listen<AppSettings>("settings:updated", ({ payload }) => {
      applyTheme(payload.theme);
    }).then((unlisten) => {
      removeSettingsListener = unlisten;
    });

    void listen<string>("recognition:created", ({ payload }) => {
      announce(payload);
      void refreshTasks("future");
    }).then((unlisten) => {
      removeRecognitionListener = unlisten;
    });

    void listen<string>("recognition:error", ({ payload }) => {
      announce(`识别失败：${payload}`);
    }).then((unlisten) => {
      removeRecognitionErrorListener = unlisten;
    });

    return () => {
      removeModeListener?.();
      removeSettingsListener?.();
      removeRecognitionListener?.();
      removeRecognitionErrorListener?.();
    };
  }, [announce, refreshTasks]);

  useEffect(() => {
    if (mode === "panel" && (tab === "future" || tab === "history")) {
      void refreshTasks(tab).catch((error) => announce(String(error)));
    }
  }, [announce, mode, refreshTasks, tab]);

  useEffect(() => {
    if (mode === "panel" && tab === "weekly") {
      void listWeeklyReports()
        .then((items) => {
          setReports(items);
          setCurrentReport((current) => current ?? items[0] ?? null);
        })
        .catch((error) => announce(String(error)));
    }
  }, [announce, mode, tab]);

  useEffect(() => {
    if (mode !== "compact") return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void hideWindow();
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [hideWindow]);

  const confirmClipboardRecognition = async () => {
    const candidate = clipboardCandidate;
    if (!candidate) return;

    setBusy(true);
    try {
      if (candidate.type === "image") {
        await scheduleImageRecognition(candidate.content, "clipboard_image");
      } else {
        await scheduleTextRecognition(candidate.content, "clipboard_text");
      }
      setInput("");
      setClipboardCandidate(null);
      await hideWindow();
    } catch (error) {
      announce(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value) {
      await confirmClipboardRecognition();
      return;
    }

    setBusy(true);
    try {
      await scheduleManualRecognition(value);
      setInput("");
      setClipboardCandidate(null);
      await hideWindow();
    } catch (error) {
      announce(String(error));
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (action: (id: string) => Promise<Task | null>, id: string, text: string) => {
    setBusy(true);
    try {
      await action(id);
      if (tab === "future" || tab === "history") await refreshTasks(tab);
      announce(text);
    } catch (error) {
      announce(String(error));
    } finally {
      setBusy(false);
    }
  };

  const captureClipboard = async () => {
    setBusy(true);
    try {
      const payload = await readClipboardPayload();
      if (!payload.content) throw new Error("剪贴板里没有可识别的内容");
      setInput("");
      setClipboardCandidate(payload);
      announce(payload.type === "image" ? "已读取剪贴板图片，点击“识别”发送给模型" : "已读取剪贴板内容，点击“识别”发送给模型");
    } catch (error) {
      announce(String(error));
    } finally {
      setBusy(false);
    }
  };

  const captureScreen = async () => {
    setBusy(true);
    try {
      await startScreenshotSelection();
    } catch (error) {
      announce(String(error));
    } finally {
      setBusy(false);
    }
  };

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return tasks;
    return tasks.filter((task) => `${task.title} ${task.notes ?? ""} ${task.tags.join(" ")}`.toLocaleLowerCase().includes(query));
  }, [search, tasks]);
  const futureGroups = useMemo(() => groupFutureTasks(visibleTasks), [visibleTasks]);
  const shouldShowLater = laterExpanded || Boolean(search.trim());
  const capturePlaceholder = clipboardCandidate
    ? clipboardCandidate.type === "image"
      ? "已读取剪贴板图片，点击“识别”发送给模型"
      : `剪贴板：${clipboardCandidate.content.replace(/\s+/g, " ").trim().slice(0, 96)}${clipboardCandidate.content.length > 96 ? "…" : ""}`
    : "写下任务，例如：明天下午 3 点交方案 #工作 !高";

  return (
    <main className={cn("capture-shell", mode === "panel" && "capture-shell-expanded")}>
      <header className="capture-bar" data-tauri-drag-region>
        <div className="capture-input-wrap">
          <img src={cadenceLogo} className="capture-logo" alt="" aria-hidden="true" />
          <form onSubmit={handleCreate} className="capture-form">
            <input
              id="quick-capture"
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                if (clipboardCandidate) setClipboardCandidate(null);
              }}
              className="capture-input"
              placeholder={capturePlaceholder}
              aria-label="快速添加任务"
            />
            <button type="submit" className="sr-only">添加任务</button>
          </form>
          {busy && <LoaderCircle size={16} className="animate-spin text-muted-foreground" aria-label="正在处理" />}
        </div>
        <div className="capture-actions" data-tauri-drag-region="false">
          {clipboardCandidate && (
            <Button variant="outline" size="sm" className="clipboard-confirm" onClick={confirmClipboardRecognition} disabled={busy} aria-label="确认识别剪贴板内容" title="确认识别剪贴板内容">
              <Sparkles size={15} /> 识别
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={captureClipboard} disabled={busy} aria-label="读取剪贴板内容" title="读取剪贴板内容">
            <ClipboardPaste size={17} />
          </Button>
          <Button variant="ghost" size="icon" onClick={captureScreen} disabled={busy} aria-label="框选屏幕区域识别" title="框选屏幕区域识别">
            <WandSparkles size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void (mode === "panel" ? closePanel() : openPanel())}
            disabled={busy}
            aria-label={mode === "panel" ? "收起任务面板" : "展开任务面板"}
            aria-expanded={mode === "panel"}
            title={mode === "panel" ? "收起任务面板" : "展开任务面板"}
          >
            <ChevronDown size={18} className={cn("transition-transform", mode === "panel" && "rotate-180")} />
          </Button>
        </div>
      </header>

      {mode === "panel" && (
        <section className="task-panel" aria-label="任务面板">
          <div className="task-panel-heading">
            <div>
              <p className="eyebrow">Cadence</p>
              <h1>{tab === "future" ? "未来安排" : tab === "history" ? "任务历史" : "周总结"}</h1>
            </div>
            {tab !== "weekly" && (
              <label className="panel-search">
                <Search size={15} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务" aria-label="搜索任务" />
              </label>
            )}
          </div>

          <nav className="panel-tabs" aria-label="任务分类">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={cn("panel-tab", tab === id && "panel-tab-active")}
                onClick={() => {
                  setTab(id);
                  setSearch("");
                  if (id === "future") setLaterExpanded(false);
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>

          <div className="panel-content" aria-busy={busy}>
            {tab === "future" && (
              <FutureTasks
                groups={futureGroups}
                empty={visibleTasks.length === 0}
                laterExpanded={shouldShowLater}
                onToggleLater={() => setLaterExpanded((value) => !value)}
                onComplete={(id) => mutate(completeTask, id, "任务已完成")}
                onReopen={(id) => mutate(reopenTask, id, "任务已重新打开")}
                onDelete={(id) => mutate(deleteTask, id, "任务已删除")}
              />
            )}
            {tab === "history" && (
              <TaskCollection
                title="已完成"
                tasks={visibleTasks}
                emptyTitle="还没有完成记录"
                emptyText="完成的任务会留在这里，方便回顾。"
                onComplete={(id) => mutate(completeTask, id, "任务已完成")}
                onReopen={(id) => mutate(reopenTask, id, "任务已重新打开")}
                onDelete={(id) => mutate(deleteTask, id, "任务已删除")}
              />
            )}
            {tab === "weekly" && (
              <WeeklyPanel
                reports={reports}
                current={currentReport}
                busy={busy}
                onSelect={setCurrentReport}
                onGenerate={async (useAi) => {
                  setBusy(true);
                  try {
                    const report = await generateWeeklyReport(useAi);
                    setCurrentReport(report);
                    setReports((items) => [report, ...items.filter((item) => item.id !== report.id)]);
                    announce("周总结已生成");
                  } catch (error) {
                    announce(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </div>
        </section>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">{message}</div>
      {message && <div className="toast" role="status"><CheckCircle2 size={16} />{message}</div>}
    </main>
  );
}

interface TaskActions {
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
}

function TaskCollection({ title, tasks, emptyTitle, emptyText, onComplete, onReopen, onDelete }: TaskActions & {
  title: string;
  tasks: Task[];
  emptyTitle: string;
  emptyText: string;
}) {
  if (!tasks.length) {
    return emptyTitle ? <EmptyState title={emptyTitle} text={emptyText} /> : null;
  }

  return (
    <section className="task-group">
      <h2 className="task-group-title">{title}<span>{tasks.length}</span></h2>
      <div className="task-list">
        {tasks.map((task) => <TaskItem key={task.id} task={task} onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />)}
      </div>
    </section>
  );
}

function FutureTasks({ groups, empty, laterExpanded, onToggleLater, onComplete, onReopen, onDelete }: TaskActions & {
  groups: ReturnType<typeof groupFutureTasks>;
  empty: boolean;
  laterExpanded: boolean;
  onToggleLater: () => void;
}) {
  if (empty) {
    return <EmptyState title="接下来很清爽" text="用上方输入框记下一件事，回车即可保存。" />;
  }

  return (
    <div className="future-groups">
      <TaskCollection title="逾期" tasks={groups.overdue} emptyTitle="" emptyText="" onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />
      <TaskCollection title="今天" tasks={groups.today} emptyTitle="" emptyText="" onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />
      {groups.upcoming.map((group) => (
        <TaskCollection key={group.key} title={group.label} tasks={group.tasks} emptyTitle="" emptyText="" onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />
      ))}
      {groups.later.length > 0 && (
        <section className="task-group later-group">
          <button className="later-toggle" onClick={onToggleLater} aria-expanded={laterExpanded}>
            <ChevronRight size={16} className={cn("transition-transform", laterExpanded && "rotate-90")} />
            <span>以后</span>
            <span className="task-group-count">{groups.later.length}</span>
          </button>
          {laterExpanded && <div className="task-list">{groups.later.map((task) => <TaskItem key={task.id} task={task} onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />)}</div>}
        </section>
      )}
      <TaskCollection title="待安排" tasks={groups.unscheduled} emptyTitle="" emptyText="" onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><Archive size={28} /><h2>{title}</h2><p>{text}</p></div>;
}

function WeeklyPanel({ reports, current, busy, onGenerate, onSelect }: {
  reports: WeeklyReport[];
  current: WeeklyReport | null;
  busy: boolean;
  onGenerate: (useAi: boolean) => void;
  onSelect: (report: WeeklyReport) => void;
}) {
  return (
    <div className="weekly-panel">
      <div className="weekly-actions">
        <p>回顾完成过的事，也为下一周留出空间。</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onGenerate(false)} disabled={busy}>生成数据版</Button>
          <Button onClick={() => onGenerate(true)} disabled={busy}><Sparkles size={16} />AI 总结</Button>
        </div>
      </div>
      <div className="report-layout">
        <aside className="report-list">
          {reports.length === 0 && <p className="p-4 text-sm text-muted-foreground">还没有周总结。</p>}
          {reports.map((report) => <button key={report.id} onClick={() => onSelect(report)}><strong>{report.periodStart.slice(0, 10)}</strong><span>{report.aiStatus === "generated" ? "AI 版" : "数据版"}</span></button>)}
        </aside>
        <article className="report-paper">
          {current ? <pre>{current.contentMarkdown}</pre> : <EmptyState title="生成第一份周总结" text="Cadence 会根据本地任务历史整理完成情况与下周重点。" />}
        </article>
      </div>
    </div>
  );
}
