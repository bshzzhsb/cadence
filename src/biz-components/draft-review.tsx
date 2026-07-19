import { useEffect, useRef, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import type { TaskDraft } from "@/lib/types";
import { formatDue } from "@/lib/utils";
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
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="draft-title">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles size={14} /> 智能识别
            </div>
            <h2 id="draft-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
              确认要创建的任务
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Cadence 不会在你确认前写入任务。</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label="关闭">
            <X size={18} />
          </Button>
        </header>

        <div className="my-5 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {items.map((draft, index) => (
            <label key={`${draft.title}-${index}`} className="draft-row">
              <input
                type="checkbox"
                checked={draft.selected}
                onChange={(event) =>
                  setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, selected: event.target.checked } : item)))
                }
                className="sr-only"
              />
              <span className={`task-check mt-0.5 ${draft.selected ? "task-check-complete" : ""}`}>
                {draft.selected && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{draft.title}</span>
                <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{formatDue(draft.dueAt ?? null)}</span>
                  {draft.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>)}
                  {draft.uncertainFields.length > 0 && <Badge className="border-amber-200 bg-amber-50 text-amber-700">需要确认</Badge>}
                </span>
              </span>
            </label>
          ))}
        </div>

        <footer className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">已选择 {selected.length} / {items.length}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>取消</Button>
            <Button
              disabled={!selected.length || saving}
              onClick={async () => {
                setSaving(true);
                await onConfirm(selected);
                setSaving(false);
              }}
            >
              {saving ? "正在创建…" : `创建 ${selected.length} 项任务`}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
