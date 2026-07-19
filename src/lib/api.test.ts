import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getSettings, saveSettings } from "@/lib/api";
import { defaultSettings } from "@/lib/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readImage: vi.fn(),
  readText: vi.fn(),
}));

describe("desktop API bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("reads and saves settings through Tauri instead of browser storage", async () => {
    vi.mocked(invoke).mockResolvedValue(defaultSettings);

    await getSettings();
    expect(invoke).toHaveBeenCalledWith("settings_get");

    await saveSettings(defaultSettings, { aiKey: "api-key" });
    expect(invoke).toHaveBeenCalledWith("settings_update", {
      settings: defaultSettings,
      secrets: { aiKey: "api-key" },
    });
    expect(localStorage.length).toBe(0);
  });
});
