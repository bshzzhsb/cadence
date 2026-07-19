import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "./src") } },
  test: { environment: "jsdom", globals: true, clearMocks: true },
});
