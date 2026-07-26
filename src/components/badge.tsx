import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border/70 bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground transition-[border-color,background-color,transform] duration-[var(--motion-standard)] ease-cadence hover:-translate-y-px hover:border-primary/35 motion-reduce:transition-none motion-reduce:hover:transform-none",
        className,
      )}
      {...props}
    />
  );
}
