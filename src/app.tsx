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
import { APP_COPY } from "@/lib/copy";
import { groupFutureTasks } from "@/lib/task-groups";
import { applyTheme, cn, isTauriRuntime } from "@/lib/utils";
import { Button } from "@/components/button";
import { TaskItem } from "@/biz-components/task-item";
import cadenceLogo from "@/assets/cadence-logo-ui.png";

const tabs: Array<{ id: ViewId; label: string; icon: typeof CalendarDays }> = [
  { id: "future", label: APP_COPY.capture.tabs.future, icon: CalendarDays },
  { id: "history", label: APP_COPY.capture.tabs.history, icon: History },
  { id: "weekly", label: APP_COPY.capture.tabs.weekly, icon: LayoutList },
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
  const [busy, setBusy] = useState(false);
  const [clipboardCandidate, setClipboardCandidate] = useState<ClipboardCandidate | null>(null);
  const [laterExpanded, setLaterExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const screenshotLaunchingRef = useRef(false);

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
    setLaterExpanded(false);
    await setWindowMode("panel");
  }, [setWindowMode]);

  const closePanel = useCallback(async () => {
    await setWindowMode("compact");
  }, [setWindowMode]);

  const hideWindow = useCallback(async () => {
    setMode("compact");
    setBusy(false);
    screenshotLaunchingRef.current = false;
    setClipboardCandidate(null);
    try {
      await hideCaptureWindow();
    } catch (error) {
      announce(String(error));
    }
  }, [announce]);

  useEffect(() => {
    void getSettings().then(() => applyTheme());
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
        setLaterExpanded(false);
      }
      if (payload === "compact") {
        setBusy(false);
        screenshotLaunchingRef.current = false;
        setClipboardCandidate(null);
      }
    }).then((unlisten) => {
      removeModeListener = unlisten;
    });

    void listen<AppSettings>("settings:updated", () => {
      applyTheme();
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
      announce(APP_COPY.capture.toast.recognitionFailed(payload));
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
      if (!payload.content) throw new Error(APP_COPY.capture.errors.emptyClipboard);
      setInput("");
      setClipboardCandidate(payload);
      announce(payload.type === "image" ? APP_COPY.capture.toast.clipboardImageReady : APP_COPY.capture.toast.clipboardTextReady);
    } catch (error) {
      announce(String(error));
    } finally {
      setBusy(false);
    }
  };

  const captureScreen = async () => {
    if (screenshotLaunchingRef.current) return;

    screenshotLaunchingRef.current = true;
    try {
      await startScreenshotSelection();
    } catch (error) {
      announce(String(error));
    } finally {
      screenshotLaunchingRef.current = false;
    }
  };

  const futureGroups = useMemo(() => groupFutureTasks(tasks), [tasks]);
  const capturePlaceholder = clipboardCandidate
    ? clipboardCandidate.type === "image"
      ? APP_COPY.capture.placeholder.clipboardImage
      : APP_COPY.capture.placeholder.clipboardText(clipboardCandidate.content)
    : APP_COPY.capture.placeholder.default;

  return (
    <main className="relative isolate fixed inset-[var(--capture-shadow-margin)] flex h-auto flex-col overflow-hidden rounded-[18px] border border-border bg-background shadow-cadence-shell animate-cadence-shell-breathe before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-cadence-edge before:bg-[length:240%_100%] before:content-[''] before:animate-cadence-edge-sweep">
      <header className={cn("relative z-10 flex h-[60px] min-h-0 flex-none items-center gap-2 bg-card py-2 pl-[14px] pr-[10px]", mode === "compact" && "h-full", mode === "panel" && "border-b border-border")} data-tauri-drag-region>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <img src={cadenceLogo} className="h-7 w-7 flex-none rounded-lg object-cover" alt="" aria-hidden="true" />
          <form onSubmit={handleCreate} className="flex min-w-0 flex-1">
            <input
              id="quick-capture"
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                if (clipboardCandidate) setClipboardCandidate(null);
              }}
              className="w-full min-w-0 border-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              placeholder={capturePlaceholder}
              aria-label={APP_COPY.capture.actions.quickAdd}
            />
            <button type="submit" className="sr-only">{APP_COPY.capture.actions.addTask}</button>
          </form>
          {busy && <LoaderCircle size={16} className="animate-spin text-muted-foreground" aria-label={APP_COPY.capture.actions.processing} />}
        </div>
        <div className="flex flex-none items-center gap-px" data-tauri-drag-region="false">
          {clipboardCandidate && (
            <Button variant="outline" size="sm" className="gap-[5px] rounded-[10px] px-2.5" onClick={confirmClipboardRecognition} disabled={busy} aria-label={APP_COPY.capture.actions.confirmClipboardRecognition} title={APP_COPY.capture.actions.confirmClipboardRecognition}>
              <Sparkles size={15} /> {APP_COPY.capture.actions.recognize}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={captureClipboard} disabled={busy} aria-label={APP_COPY.capture.actions.readClipboard} title={APP_COPY.capture.actions.readClipboard}>
            <ClipboardPaste size={17} />
          </Button>
          <Button variant="ghost" size="icon" onClick={captureScreen} disabled={busy} aria-label={APP_COPY.capture.actions.captureScreen} title={APP_COPY.capture.actions.captureScreen}>
            <WandSparkles size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void (mode === "panel" ? closePanel() : openPanel())}
            disabled={busy}
            aria-label={mode === "panel" ? APP_COPY.capture.actions.collapsePanel : APP_COPY.capture.actions.expandPanel}
            aria-expanded={mode === "panel"}
            title={mode === "panel" ? APP_COPY.capture.actions.collapsePanel : APP_COPY.capture.actions.expandPanel}
          >
            <ChevronDown size={18} className={cn("transition-transform", mode === "panel" && "rotate-180")} />
          </Button>
        </div>
      </header>

      {mode === "panel" && (
        <section className="flex min-h-0 flex-1 flex-col px-[25px] pt-[14px] animate-cadence-fade-up max-[620px]:px-[17px]" aria-label={APP_COPY.capture.panel.label}>
          <nav className="flex flex-none gap-1 border-b border-border" aria-label={APP_COPY.capture.panel.tabsLabel}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={cn(
                  "relative inline-flex items-center gap-1.5 border-0 border-b-2 border-transparent bg-transparent px-2.5 pb-2.5 pt-[9px] text-[13px] font-semibold text-muted-foreground transition-[color,transform] duration-[var(--motion-standard)] ease-cadence hover:-translate-y-px hover:text-foreground motion-reduce:hover:transform-none",
                  tab === id && "text-primary after:absolute after:bottom-[-2px] after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-primary after:shadow-[0_0_12px_hsl(var(--tech-glow)/.34)] after:content-[''] after:animate-cadence-indicator-in",
                )}
                onClick={() => {
                  setTab(id);
                  if (id === "future") setLaterExpanded(false);
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>

          <div className="cadence-scrollbar min-h-0 flex-1 overflow-y-auto pb-7 pt-5" aria-busy={busy}>
            {tab === "future" && (
              <FutureTasks
                groups={futureGroups}
                empty={tasks.length === 0}
                laterExpanded={laterExpanded}
                onToggleLater={() => setLaterExpanded((value) => !value)}
                onComplete={(id) => mutate(completeTask, id, APP_COPY.capture.toast.taskCompleted)}
                onReopen={(id) => mutate(reopenTask, id, APP_COPY.capture.toast.taskReopened)}
                onDelete={(id) => mutate(deleteTask, id, APP_COPY.capture.toast.taskDeleted)}
              />
            )}
            {tab === "history" && (
              <TaskCollection
                title={APP_COPY.capture.panel.historyTitle}
                tasks={tasks}
                emptyTitle={APP_COPY.capture.panel.historyEmptyTitle}
                emptyText={APP_COPY.capture.panel.historyEmptyText}
                onComplete={(id) => mutate(completeTask, id, APP_COPY.capture.toast.taskCompleted)}
                onReopen={(id) => mutate(reopenTask, id, APP_COPY.capture.toast.taskReopened)}
                onDelete={(id) => mutate(deleteTask, id, APP_COPY.capture.toast.taskDeleted)}
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
                    announce(APP_COPY.capture.toast.weeklyGenerated);
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
      {message && <div className="fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-xl border border-border bg-foreground px-3 py-2 text-xs text-background shadow-xl" role="status"><CheckCircle2 size={16} />{message}</div>}
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
    <section className="min-w-0">
      <h2 className="mb-[7px] flex w-full items-center gap-[7px] px-0.5 text-left text-xs font-bold text-muted-foreground">{title}<span className="inline-grid h-[19px] min-w-[19px] place-items-center rounded-full bg-secondary px-[5px] text-[10px] text-muted-foreground">{tasks.length}</span></h2>
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-cadence-card animate-cadence-fade-up">
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
    return <EmptyState title={APP_COPY.capture.panel.futureEmptyTitle} text={APP_COPY.capture.panel.futureEmptyText} />;
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <TaskCollection title={APP_COPY.capture.panel.overdue} tasks={groups.overdue} emptyTitle="" emptyText="" onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />
      <TaskCollection title={APP_COPY.capture.panel.today} tasks={groups.today} emptyTitle="" emptyText="" onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />
      {groups.upcoming.map((group) => (
        <TaskCollection key={group.key} title={group.label} tasks={group.tasks} emptyTitle="" emptyText="" onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />
      ))}
      {groups.later.length > 0 && (
        <section className="min-w-0">
          <button className="mb-[7px] flex w-full items-center gap-[7px] border-0 bg-transparent px-0.5 py-1.5 text-left text-xs font-bold text-foreground hover:text-primary" onClick={onToggleLater} aria-expanded={laterExpanded}>
            <ChevronRight size={16} className={cn("transition-transform", laterExpanded && "rotate-90")} />
            <span>{APP_COPY.capture.panel.later}</span>
            <span className="inline-grid h-[19px] min-w-[19px] place-items-center rounded-full bg-secondary px-[5px] text-[10px] text-muted-foreground">{groups.later.length}</span>
          </button>
          {laterExpanded && <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-cadence-card animate-cadence-fade-up">{groups.later.map((task) => <TaskItem key={task.id} task={task} onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />)}</div>}
        </section>
      )}
      <TaskCollection title={APP_COPY.capture.panel.unscheduled} tasks={groups.unscheduled} emptyTitle="" emptyText="" onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} />
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="flex min-h-[240px] flex-col items-center justify-center p-9 text-center text-muted-foreground"><Archive size={28} className="mb-3 text-primary opacity-80" /><h2 className="m-0 font-serif text-lg text-foreground">{title}</h2><p className="mt-2 mb-0 text-[13px]">{text}</p></div>;
}

function WeeklyPanel({ reports, current, busy, onGenerate, onSelect }: {
  reports: WeeklyReport[];
  current: WeeklyReport | null;
  busy: boolean;
  onGenerate: (useAi: boolean) => void;
  onSelect: (report: WeeklyReport) => void;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-[18px] flex items-center justify-between gap-[14px] max-[620px]:items-start max-[620px]:flex-col">
        <p className="m-0 text-[13px] text-muted-foreground">{APP_COPY.capture.weekly.intro}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onGenerate(false)} disabled={busy}>{APP_COPY.capture.weekly.generateData}</Button>
          <Button onClick={() => onGenerate(true)} disabled={busy}><Sparkles size={16} />{APP_COPY.capture.weekly.generateAi}</Button>
        </div>
      </div>
      <div className="grid min-h-[300px] flex-1 grid-cols-[155px_minmax(0,1fr)] gap-[14px] max-[620px]:grid-cols-1">
        <aside className="cadence-scrollbar overflow-hidden overflow-y-auto rounded-[14px] border border-border bg-card shadow-cadence-card animate-cadence-fade-up">
          {reports.length === 0 && <p className="p-4 text-sm text-muted-foreground">{APP_COPY.capture.weekly.emptyList}</p>}
          {reports.map((report) => <button key={report.id} className="flex w-full flex-col gap-[3px] border-0 border-b border-border bg-transparent p-3 text-left transition-[background,transform] duration-[var(--motion-standard)] ease-cadence hover:translate-x-0.5 hover:bg-accent motion-reduce:hover:transform-none" onClick={() => onSelect(report)}><strong>{report.periodStart.slice(0, 10)}</strong><span className="text-[11px] text-muted-foreground">{report.aiStatus === "generated" ? APP_COPY.capture.weekly.aiReport : APP_COPY.capture.weekly.dataReport}</span></button>)}
        </aside>
        <article className="min-w-0 overflow-hidden rounded-[14px] border border-border bg-card p-5 shadow-cadence-card animate-cadence-fade-up">
          {current ? <pre className="m-0 whitespace-pre-wrap font-sans text-[13px] leading-[1.75]">{current.contentMarkdown}</pre> : <EmptyState title={APP_COPY.capture.weekly.emptyTitle} text={APP_COPY.capture.weekly.emptyText} />}
        </article>
      </div>
    </div>
  );
}
