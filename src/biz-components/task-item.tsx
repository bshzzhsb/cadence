import { CalendarClock, Check, RotateCcw, Trash2 } from "lucide-react";
import { APP_COPY } from "@/lib/copy";
import type { Task } from "@/lib/types";
import { cn, formatDue, isOverdue } from "@/lib/utils";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";

interface TaskItemProps {
  task: Task;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskItem({ task, onComplete, onReopen, onDelete }: TaskItemProps) {
  const overdue = task.status === "open" && isOverdue(task.dueAt);
  return (
    <article className="task-row group" aria-label={task.title}>
      <button
        className={cn("task-check", task.status === "completed" && "task-check-complete")}
        onClick={() => (task.status === "completed" ? onReopen(task.id) : onComplete(task.id))}
        aria-label={task.status === "completed" ? APP_COPY.taskItem.reopenTaskWithTitle(task.title) : APP_COPY.taskItem.completeTask(task.title)}
      >
        {task.status === "completed" && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <h3
          className={cn(
            "truncate text-[15px] font-medium text-foreground",
            task.status === "completed" && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.dueAt && (
            <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-destructive")}>
              <CalendarClock size={13} />
              {overdue ? APP_COPY.taskItem.overduePrefix : ""}
              {formatDue(task.dueAt)}
            </span>
          )}
          {task.priority === "high" && <Badge className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300">{APP_COPY.taskItem.highPriority}</Badge>}
          {task.tags.map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </div>
      </div>
      <div className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {task.status === "completed" && (
          <Button variant="ghost" size="icon" onClick={() => onReopen(task.id)} aria-label={APP_COPY.taskItem.reopen}>
            <RotateCcw size={15} />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => onDelete(task.id)} aria-label={APP_COPY.taskItem.delete}>
          <Trash2 size={15} />
        </Button>
      </div>
    </article>
  );
}
