import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsWindow } from "@/biz-components/settings-window";
import * as api from "@/lib/api";
import { APP_COPY } from "@/lib/copy";
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

    fireEvent.click(await screen.findByRole("tab", { name: new RegExp(APP_COPY.settings.tabs.ai.label) }));
    const baseUrl = await screen.findByLabelText(APP_COPY.settings.fields.aiBaseUrl.label);
    expect(baseUrl).toHaveValue("https://old.example/v1");
    expect(screen.getByLabelText(APP_COPY.settings.fields.aiTextModel.label)).toHaveValue("old-text-model");
    expect(screen.getByLabelText(APP_COPY.settings.fields.aiVisionModel.label)).toHaveValue("old-vision-model");

    fireEvent.change(baseUrl, { target: { value: "https://new.example/v1" } });
    fireEvent.change(screen.getByLabelText(APP_COPY.settings.fields.aiKey.label), { target: { value: "new-api-key" } });
    fireEvent.change(screen.getByLabelText(APP_COPY.settings.fields.aiTextModel.label), { target: { value: "new-text-model" } });
    fireEvent.change(screen.getByLabelText(APP_COPY.settings.fields.aiVisionModel.label), { target: { value: "new-vision-model" } });
    fireEvent.click(screen.getByRole("button", { name: APP_COPY.settings.actions.save }));

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledTimes(1));
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiBaseUrl: "https://new.example/v1",
        aiTextModel: "new-text-model",
        aiVisionModel: "new-vision-model",
      }),
      { aiKey: "new-api-key", larkSecret: undefined },
    );
    expect(screen.getByLabelText(APP_COPY.settings.fields.aiKey.label)).toHaveValue("");
  });
});
