import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { APP_COPY } from "@/lib/copy";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function formatDue(value: string | null) {
  if (!value) return APP_COPY.due.unscheduled;
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return `${APP_COPY.due.todayPrefix} ${date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
  }
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isOverdue(value: string | null) {
  return Boolean(value && new Date(value).getTime() < Date.now());
}

export function applyTheme() {
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "light";
}
