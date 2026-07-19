import { invoke } from "@tauri-apps/api/core";
import { readImage, readText } from "@tauri-apps/plugin-clipboard-manager";
import {
  type AppSettings,
  type CaptureWindowMode,
  type CaptureSource,
  type SyncStatus,
  type Task,
  type TaskDraft,
  type TaskViewId,
  type WeeklyReport,
} from "@/lib/types";

export async function listTasks(view: TaskViewId): Promise<Task[]> {
  return invoke("task_list", { view });
}

export async function setCaptureWindowMode(mode: CaptureWindowMode) {
  return invoke<void>("capture_set_mode", { mode });
}

export async function hideCaptureWindow() {
  return invoke<void>("capture_hide");
}

export async function startScreenshotSelection() {
  return invoke<void>("screenshot_selection_start");
}

export async function submitScreenshotSelection(selection: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return invoke<void>("screenshot_selection_submit", { selection });
}

export async function cancelScreenshotSelection() {
  return invoke<void>("screenshot_selection_cancel");
}

export async function scheduleManualRecognition(
  rawInput: string,
  sourceType: CaptureSource = "manual",
  sourceExcerpt?: string,
) {
  return invoke<void>("recognition_schedule_manual", { input: { rawInput, sourceType, sourceExcerpt } });
}

export async function scheduleTextRecognition(content: string, sourceType: CaptureSource) {
  return invoke<void>("recognition_schedule_text", { content, sourceType });
}

export async function scheduleImageRecognition(dataUrl: string, sourceType: CaptureSource) {
  return invoke<void>("recognition_schedule_image", { dataUrl, sourceType });
}

export async function createTask(
  rawInput: string,
  sourceType: CaptureSource = "manual",
  sourceExcerpt?: string,
): Promise<Task> {
  return invoke("task_create", { input: { rawInput, sourceType, sourceExcerpt } });
}

export async function createDraftTask(
  draft: TaskDraft,
  sourceType: CaptureSource,
): Promise<Task> {
  return invoke("task_create_from_draft", { draft, sourceType });
}

export async function saveRecognizedTasks(
  drafts: TaskDraft[],
  sourceType: CaptureSource,
): Promise<string> {
  return invoke("recognition_create", { drafts, sourceType });
}

async function mutateTask(id: string, action: "complete" | "reopen" | "delete") {
  return invoke<Task | null>(`task_${action}`, { id });
}

export const completeTask = (id: string) => mutateTask(id, "complete");
export const reopenTask = (id: string) => mutateTask(id, "reopen");
export const deleteTask = (id: string) => mutateTask(id, "delete");

export async function analyzeText(content: string): Promise<TaskDraft[]> {
  return invoke("analyze_text", { content });
}

export async function analyzeImage(dataUrl: string): Promise<TaskDraft[]> {
  return invoke("analyze_image", { dataUrl });
}

export async function readClipboardPayload() {
  try {
    const image = await readImage();
    const rgba = await image.rgba();
    const size = await image.size();
    if (rgba.length && size.width && size.height) {
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      context?.putImageData(new ImageData(new Uint8ClampedArray(rgba), size.width, size.height), 0, 0);
      return { type: "image" as const, content: canvas.toDataURL("image/jpeg", 0.85) };
    }
  } catch {
    // Clipboard commonly contains text only.
  }
  return { type: "text" as const, content: await readText() };
}

export async function capturePrimaryScreen(): Promise<string> {
  return invoke("capture_primary_screen");
}

export async function getSettings(): Promise<AppSettings> {
  return invoke("settings_get");
}

export async function saveSettings(settings: AppSettings, secrets?: { aiKey?: string; larkSecret?: string }) {
  return invoke<void>("settings_update", { settings, secrets });
}

export async function generateWeeklyReport(useAi: boolean): Promise<WeeklyReport> {
  return invoke("weekly_generate", { useAi });
}

export async function listWeeklyReports(): Promise<WeeklyReport[]> {
  return invoke("weekly_list");
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return invoke("lark_status");
}

export async function syncNow(): Promise<SyncStatus> {
  return invoke("lark_sync_now");
}

export async function beginLarkOAuth(): Promise<SyncStatus> {
  return invoke("lark_oauth_begin");
}
