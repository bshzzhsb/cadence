import { afterEach, describe, expect, it } from "vitest";
import { applyTheme } from "@/lib/utils";

describe("fixed light theme", () => {
  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("removes legacy dark mode state and enforces light color scheme", () => {
    document.documentElement.classList.add("dark");

    applyTheme();

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
