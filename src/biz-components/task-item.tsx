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
    <article className="group relative flex min-h-[69px] items-start gap-3 border-b border-border/70 px-4 py-[15px] transition-[background,transform,box-shadow] duration-[var(--motion-standard)] ease-cadence last:border-b-0 hover:translate-x-0.5 hover:bg-accent/45 hover:shadow-cadence-task-hover motion-reduce:hover:transform-none after:pointer-events-none after:absolute after:inset-0 after:bg-cadence-row-sheen after:bg-[length:220%_100%] after:content-[''] after:opacity-0 after:transition-opacity after:duration-[var(--motion-standard)] after:ease-cadence hover:after:animate-cadence-row-sheen hover:after:opacity-100" aria-label={task.title}>
      <button
        className={cn(
          "inline-grid h-5 w-5 flex-none place-items-center rounded-[7px] border-[1.5px] border-input bg-transparent text-primary-foreground transition-[border-color,background-color,box-shadow,transform] duration-[var(--motion-standard)] ease-cadence hover:scale-105 hover:border-primary hover:shadow-cadence-check motion-reduce:hover:transform-none",
          task.status === "completed" && "border-primary bg-primary",
        )}
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
          {task.priority === "high" && <Badge className="border-primary/35 bg-accent text-accent-foreground">{APP_COPY.taskItem.highPriority}</Badge>}
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
