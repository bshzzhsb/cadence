export type TaskStatus = "open" | "completed";
export type TaskPriority = "low" | "normal" | "high";
export type CaptureSource =
  | "manual"
  | "clipboard_text"
  | "clipboard_image"
  | "screenshot";

export type TaskViewId = "future" | "history";
export type ViewId = TaskViewId | "weekly";

export type CaptureWindowMode = "compact" | "panel";

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  timezone: string;
  priority: TaskPriority;
  tags: string[];
  status: TaskStatus;
  sourceType: CaptureSource;
  sourceExcerpt: string | null;
  version: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDraft {
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  timezone: string;
  priority: TaskPriority;
  tags: string[];
  sourceExcerpt?: string | null;
  confidence: number;
  uncertainFields: string[];
  selected?: boolean;
}

export interface WeeklyReport {
  id: string;
  periodStart: string;
  periodEnd: string;
  contentMarkdown: string;
  aiStatus: "not_requested" | "generated" | "fallback";
  generatedAt: string;
}

export interface AppSettings {
  defaultDueHour: number;
  weeklyDay: number;
  weeklyTime: string;
  weeklyEnabled: boolean;
  theme: "system" | "light" | "dark";
  aiBaseUrl: string;
  aiTextModel: string;
  aiVisionModel: string;
  larkAppId: string;
  larkBaseUrl: string;
  larkDocumentUrl: string;
}

export interface SyncStatus {
  state: "disabled" | "idle" | "syncing" | "error" | "auth_required";
  pendingCount: number;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export const defaultSettings: AppSettings = {
  defaultDueHour: 18,
  weeklyDay: 0,
  weeklyTime: "20:00",
  weeklyEnabled: true,
  theme: "system",
  aiBaseUrl: "",
  aiTextModel: "mimo-v2.5",
  aiVisionModel: "mimo-v2.5",
  larkAppId: "",
  larkBaseUrl: "",
  larkDocumentUrl: "",
};
