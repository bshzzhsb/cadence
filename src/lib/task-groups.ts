import type { Task } from "@/lib/types";

export interface DatedTaskGroup {
  key: string;
  label: string;
  tasks: Task[];
}

export interface FutureTaskGroups {
  overdue: Task[];
  today: Task[];
  upcoming: DatedTaskGroup[];
  later: Task[];
  unscheduled: Task[];
}

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(value: Date) {
  const result = startOfDay(value);
  result.setHours(23, 59, 59, 999);
  return result;
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: Date) {
  return value.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    if (!left.dueAt || !right.dueAt) return left.createdAt.localeCompare(right.createdAt);
    return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
  });
}

export function groupFutureTasks(tasks: Task[], now = new Date()): FutureTaskGroups {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const upcomingEnd = endOfDay(new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 7));
  const overdue: Task[] = [];
  const today: Task[] = [];
  const later: Task[] = [];
  const unscheduled: Task[] = [];
  const upcoming = new Map<string, DatedTaskGroup>();

  tasks.forEach((task) => {
    if (!task.dueAt) {
      unscheduled.push(task);
      return;
    }

    const dueAt = new Date(task.dueAt);
    if (dueAt.getTime() < todayStart.getTime()) {
      overdue.push(task);
    } else if (dueAt.getTime() <= todayEnd.getTime()) {
      today.push(task);
    } else if (dueAt.getTime() <= upcomingEnd.getTime()) {
      const key = dateKey(dueAt);
      const current = upcoming.get(key) ?? { key, label: dateLabel(dueAt), tasks: [] };
      current.tasks.push(task);
      upcoming.set(key, current);
    } else {
      later.push(task);
    }
  });

  return {
    overdue: sortTasks(overdue),
    today: sortTasks(today),
    upcoming: [...upcoming.values()]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((group) => ({ ...group, tasks: sortTasks(group.tasks) })),
    later: sortTasks(later),
    unscheduled: sortTasks(unscheduled),
  };
}
