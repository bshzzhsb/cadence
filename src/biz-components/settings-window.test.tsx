import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsWindow } from "@/biz-components/settings-window";
import * as api from "@/lib/api";
import { defaultSettings } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  beginLarkOAuth: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

describe("settings window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    vi.mocked(api.getSettings).mockResolvedValue({
      ...defaultSettings,
      aiBaseUrl: "https://old.example/v1",
      aiTextModel: "old-text-model",
      aiVisionModel: "old-vision-model",
    });
    vi.mocked(api.saveSettings).mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and saves model settings while passing the API key separately", async () => {
    render(<SettingsWindow />);

    const baseUrl = await screen.findByLabelText("服务地址");
    expect(baseUrl).toHaveValue("https://old.example/v1");
    expect(screen.getByLabelText("文本模型")).toHaveValue("old-text-model");
    expect(screen.getByLabelText("视觉模型")).toHaveValue("old-vision-model");

    fireEvent.change(baseUrl, { target: { value: "https://new.example/v1" } });
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "new-api-key" } });
    fireEvent.change(screen.getByLabelText("文本模型"), { target: { value: "new-text-model" } });
    fireEvent.change(screen.getByLabelText("视觉模型"), { target: { value: "new-vision-model" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledTimes(1));
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiBaseUrl: "https://new.example/v1",
        aiTextModel: "new-text-model",
        aiVisionModel: "new-vision-model",
      }),
      { aiKey: "new-api-key", larkSecret: undefined },
    );
    expect(screen.getByLabelText("API Key")).toHaveValue("");
  });
});
