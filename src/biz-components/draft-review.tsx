import { useEffect, useRef, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { APP_COPY } from "@/lib/copy";
import type { TaskDraft } from "@/lib/types";
import { cn, formatDue } from "@/lib/utils";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";

interface DraftReviewProps {
  drafts: TaskDraft[];
  onCancel: () => void;
  onConfirm: (drafts: TaskDraft[]) => Promise<void>;
}

export function DraftReview({ drafts, onCancel, onConfirm }: DraftReviewProps) {
  const [items, setItems] = useState(drafts.map((draft) => ({ ...draft, selected: true })));
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const selected = items.filter((item) => item.selected);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[rgb(18_18_18_/_0.48)] p-[18px] backdrop-blur-[4px] animate-cadence-backdrop-in" role="presentation">
      <section className="w-[min(620px,100%)] rounded-[20px] border border-border bg-card p-[22px] shadow-cadence-dialog animate-cadence-dialog-in" role="dialog" aria-modal="true" aria-labelledby="draft-title">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles size={14} /> {APP_COPY.draftReview.eyebrow}
            </div>
            <h2 id="draft-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
              {APP_COPY.draftReview.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{APP_COPY.draftReview.body}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label={APP_COPY.draftReview.close}>
            <X size={18} />
          </Button>
        </header>

        <div className="my-5 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {items.map((draft, index) => (
            <label key={`${draft.title}-${index}`} className="flex cursor-pointer items-start gap-3 rounded-[13px] border border-border p-[13px] transition-[background,border-color,transform,box-shadow] duration-[var(--motion-standard)] ease-cadence hover:translate-x-0.5 hover:border-primary/35 hover:bg-accent/45 hover:shadow-[0_8px_22px_hsl(var(--foreground)/.06)] motion-reduce:hover:transform-none">
              <input
                type="checkbox"
                checked={draft.selected}
                onChange={(event) =>
                  setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, selected: event.target.checked } : item)))
                }
                className="sr-only"
              />
              <span className={cn(
                "mt-0.5 inline-grid h-5 w-5 flex-none place-items-center rounded-[7px] border-[1.5px] border-input bg-transparent text-primary-foreground transition-[border-color,background-color,box-shadow,transform] duration-[var(--motion-standard)] ease-cadence",
                draft.selected && "border-primary bg-primary",
              )}>
                {draft.selected && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{draft.title}</span>
                <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{formatDue(draft.dueAt ?? null)}</span>
                  {draft.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>)}
                  {draft.uncertainFields.length > 0 && <Badge className="border-primary/35 bg-accent text-accent-foreground">{APP_COPY.draftReview.needsConfirmation}</Badge>}
                </span>
              </span>
            </label>
          ))}
        </div>

        <footer className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">{APP_COPY.draftReview.selectedCount(selected.length, items.length)}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>{APP_COPY.draftReview.cancel}</Button>
            <Button
              disabled={!selected.length || saving}
              onClick={async () => {
                setSaving(true);
                await onConfirm(selected);
                setSaving(false);
              }}
            >
              {saving ? APP_COPY.draftReview.saving : APP_COPY.draftReview.createTasks(selected.length)}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
