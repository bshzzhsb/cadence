import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenshotSelectionWindow } from "@/biz-components/screenshot-selection-window";
import * as api from "@/lib/api";
import { APP_COPY } from "@/lib/copy";

vi.mock("@/lib/api", () => ({
  cancelScreenshotSelection: vi.fn(),
  submitScreenshotSelection: vi.fn(),
}));

describe("ScreenshotSelectionWindow", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("submits the selection immediately without loading a full-screen image", async () => {
    vi.mocked(api.submitScreenshotSelection).mockResolvedValue();
    render(<ScreenshotSelectionWindow />);

    const stage = document.querySelector<HTMLDivElement>(".screenshot-selection-stage")!;
    Object.defineProperty(stage, "setPointerCapture", { value: vi.fn() });
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      bottom: 900,
      height: 900,
      left: 0,
      right: 1440,
      top: 0,
      width: 1440,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent(stage, new MouseEvent("pointerdown", { bubbles: true, clientX: 40, clientY: 60 }));
    fireEvent(stage, new MouseEvent("pointermove", { bubbles: true, clientX: 340, clientY: 260 }));
    fireEvent(stage, new MouseEvent("pointerup", { bubbles: true, clientX: 340, clientY: 260 }));

    fireEvent.click(await screen.findByRole("button", { name: APP_COPY.screenshotSelection.actions.recognizeSelection }));

    await waitFor(() => expect(api.submitScreenshotSelection).toHaveBeenCalledWith({
      x: 40,
      y: 60,
      width: 300,
      height: 200,
    }));
  });

  it("cancels the selection when Escape is pressed", async () => {
    vi.mocked(api.cancelScreenshotSelection).mockResolvedValue();
    render(<ScreenshotSelectionWindow />);

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(api.cancelScreenshotSelection).toHaveBeenCalledTimes(1));
  });

  it("shows a submit error and re-enables the selection controls", async () => {
    vi.mocked(api.submitScreenshotSelection).mockRejectedValue(new Error("截图失败"));
    render(<ScreenshotSelectionWindow />);

    const stage = document.querySelector<HTMLDivElement>(".screenshot-selection-stage")!;
    Object.defineProperty(stage, "setPointerCapture", { value: vi.fn() });
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      bottom: 900,
      height: 900,
      left: 0,
      right: 1440,
      top: 0,
      width: 1440,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent(stage, new MouseEvent("pointerdown", { bubbles: true, clientX: 40, clientY: 60 }));
    fireEvent(stage, new MouseEvent("pointermove", { bubbles: true, clientX: 340, clientY: 260 }));
    fireEvent(stage, new MouseEvent("pointerup", { bubbles: true, clientX: 340, clientY: 260 }));
    fireEvent.click(await screen.findByRole("button", { name: APP_COPY.screenshotSelection.actions.recognizeSelection }));

    await waitFor(() => expect(screen.getByText("Error: 截图失败")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: APP_COPY.screenshotSelection.actions.recognizeSelection })).not.toBeDisabled();
  });
});
