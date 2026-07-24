import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/app";
import * as api from "@/lib/api";
import { APP_COPY } from "@/lib/copy";
import { defaultSettings, type Task } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  analyzeImage: vi.fn(),
  analyzeText: vi.fn(),
  capturePrimaryScreen: vi.fn(),
  completeTask: vi.fn(),
  createDraftTask: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  generateWeeklyReport: vi.fn(),
  getSettings: vi.fn(),
  hideCaptureWindow: vi.fn(),
  listTasks: vi.fn(),
  listWeeklyReports: vi.fn(),
  readClipboardPayload: vi.fn(),
  reopenTask: vi.fn(),
  saveRecognizedTasks: vi.fn(),
  scheduleImageRecognition: vi.fn(),
  scheduleManualRecognition: vi.fn(),
  scheduleTextRecognition: vi.fn(),
  setCaptureWindowMode: vi.fn(),
  startScreenshotSelection: vi.fn(),
}));

function dueIn(days: number) {
  const due = new Date();
  due.setDate(due.getDate() + days);
  due.setHours(9, 0, 0, 0);
  return due.toISOString();
}

function task(id: string, title: string, dueAt: string | null, status: Task["status"] = "open"): Task {
  return {
    id,
    title,
    notes: null,
    dueAt,
    timezone: "Asia/Shanghai",
    priority: "normal",
    tags: [],
    status,
    sourceType: "manual",
    sourceExcerpt: null,
    version: 1,
    completedAt: status === "completed" ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("expanded task panel", () => {
  const futureTasks = [task("later", "十天后的任务", dueIn(10))];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    vi.mocked(api.getSettings).mockResolvedValue(defaultSettings);
    vi.mocked(api.listTasks).mockImplementation(async (view) => {
      if (view === "future") return futureTasks;
      return [task("done", "已完成任务", dueIn(-1), "completed")];
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens without panel heading or search, and keeps later tasks manually expandable", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: APP_COPY.capture.actions.expandPanel }));

    expect(await screen.findByRole("region", { name: APP_COPY.capture.panel.label })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "未来安排" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "搜索任务" })).not.toBeInTheDocument();
    await waitFor(() => expect(api.listTasks).toHaveBeenLastCalledWith("future"));
    const laterToggle = await screen.findByRole("button", { name: new RegExp(APP_COPY.capture.panel.later) });
    expect(laterToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("十天后的任务")).not.toBeInTheDocument();

    fireEvent.click(laterToggle);

    expect(await screen.findByText("十天后的任务")).toBeInTheDocument();
    expect(laterToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("hides the capture window when Escape is pressed", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: APP_COPY.capture.actions.expandPanel }));
    expect(await screen.findByRole("region", { name: APP_COPY.capture.panel.label })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(api.hideCaptureWindow).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region", { name: APP_COPY.capture.panel.label })).not.toBeInTheDocument();
  });

  it("loads clipboard content into the placeholder and waits for explicit recognition", async () => {
    const content = "明天下午交方案，优先级高";
    vi.mocked(api.readClipboardPayload).mockResolvedValue({ type: "text", content });
    vi.mocked(api.scheduleTextRecognition).mockResolvedValue();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: APP_COPY.capture.actions.readClipboard }));

    const input = screen.getByRole("textbox", { name: APP_COPY.capture.actions.quickAdd });
    await waitFor(() => expect(input).toHaveAttribute("placeholder", expect.stringContaining("剪贴板")));
    expect(api.scheduleTextRecognition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: APP_COPY.capture.actions.confirmClipboardRecognition }));

    await waitFor(() => expect(api.scheduleTextRecognition).toHaveBeenCalledWith(content, "clipboard_text"));
    expect(api.hideCaptureWindow).toHaveBeenCalled();
  });

  it("queues manually entered tasks without waiting for recognition", async () => {
    vi.mocked(api.scheduleManualRecognition).mockResolvedValue();
    render(<App />);

    const input = screen.getByRole("textbox", { name: APP_COPY.capture.actions.quickAdd });
    fireEvent.change(input, { target: { value: "明天下午交方案" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(api.scheduleManualRecognition).toHaveBeenCalledWith("明天下午交方案"));
    expect(api.hideCaptureWindow).toHaveBeenCalled();
  });
});
