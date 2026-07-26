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

describe("settings theme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getSettings).mockResolvedValue(defaultSettings);
    vi.mocked(api.saveSettings).mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("hides the legacy theme selector and saves the fixed light theme", async () => {
    render(<SettingsWindow />);

    expect(await screen.findByRole("heading", { name: "默认偏好" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "主题" })).not.toBeInTheDocument();

    fireEvent.submit(screen.getByRole("button", { name: "保存设置" }).closest("form")!);

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "light" }),
      expect.any(Object),
    ));
  });
});
