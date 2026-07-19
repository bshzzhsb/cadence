import { describe, expect, it } from "vitest";
import { groupFutureTasks } from "@/lib/task-groups";
import type { Task } from "@/lib/types";

const now = new Date("2026-07-19T12:00:00+08:00");

function task(id: string, dueAt: string | null, status: Task["status"] = "open"): Task {
  return {
    id,
    title: id,
    notes: null,
    dueAt,
    timezone: "Asia/Shanghai",
    priority: "normal",
    tags: [],
    status,
    sourceType: "manual",
    sourceExcerpt: null,
    version: 1,
    completedAt: null,
    createdAt: "2026-07-01T00:00:00+08:00",
    updatedAt: "2026-07-01T00:00:00+08:00",
  };
}

describe("groupFutureTasks", () => {
  it("separates overdue, today, the next seven days, later, and unscheduled tasks", () => {
    const groups = groupFutureTasks([
      task("overdue", "2026-07-18T18:00:00+08:00"),
      task("today", "2026-07-19T18:00:00+08:00"),
      task("upcoming", "2026-07-24T09:00:00+08:00"),
      task("later", "2026-07-27T09:00:00+08:00"),
      task("unscheduled", null),
    ], now);

    expect(groups.overdue.map((item) => item.id)).toEqual(["overdue"]);
    expect(groups.today.map((item) => item.id)).toEqual(["today"]);
    expect(groups.upcoming).toHaveLength(1);
    expect(groups.upcoming[0].tasks.map((item) => item.id)).toEqual(["upcoming"]);
    expect(groups.later.map((item) => item.id)).toEqual(["later"]);
    expect(groups.unscheduled.map((item) => item.id)).toEqual(["unscheduled"]);
  });
});
