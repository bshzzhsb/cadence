import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Crosshair, LoaderCircle, ScanLine, X } from "lucide-react";
import {
  cancelScreenshotSelection,
  submitScreenshotSelection,
} from "@/lib/api";
import { Button } from "@/components/button";
import { APP_COPY } from "@/lib/copy";

interface Point {
  x: number;
  y: number;
}

export function ScreenshotSelectionWindow() {
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cancel = useCallback(async () => {
    try {
      await cancelScreenshotSelection();
    } catch (reason) {
      setError(String(reason));
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void cancel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cancel]);

  const point = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
  };

  const selection = start && end
    ? {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      }
    : null;
  const hasSelection = Boolean(selection && selection.width > 8 && selection.height > 8);

  const confirm = async () => {
    if (!selection || !hasSelection) return;

    setBusy(true);
    setError("");
    try {
      await submitScreenshotSelection({
        x: selection.left,
        y: selection.top,
        width: selection.width,
        height: selection.height,
      });
    } catch (reason) {
      setError(String(reason));
      setBusy(false);
    }
  };

  return (
    <main className="screenshot-selection-window fixed inset-0 select-none overflow-hidden bg-transparent" aria-label={APP_COPY.screenshotSelection.windowLabel}>
      <div
        className="screenshot-selection-stage fixed inset-0 touch-none cursor-crosshair overflow-hidden bg-[rgb(18_18_18_/_0.08)]"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const value = point(event);
          setStart(value);
          setEnd(value);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (dragging) setEnd(point(event));
        }}
        onPointerUp={(event) => {
          if (dragging) setEnd(point(event));
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        {selection && (
          <span
            className="screen-selection-box pointer-events-none absolute z-[2] border-2 border-selection-outline bg-selection-fill shadow-[0_0_0_9999px_rgb(18_18_18_/_0.5),0_0_24px_hsl(var(--tech-glow)/.4)] animate-cadence-selection-pulse"
            style={{
              left: selection.left,
              top: selection.top,
              width: selection.width,
              height: selection.height,
            }}
          />
        )}

        <div className="screenshot-selection-hint fixed left-1/2 top-[22px] z-[3] inline-flex -translate-x-1/2 items-center gap-[7px] rounded-full border border-[rgb(255_255_255_/_0.26)] bg-[rgb(18_18_18_/_0.84)] px-[13px] py-2 text-xs text-primary-foreground shadow-[0_10px_30px_rgb(18_18_18_/_0.28),0_0_18px_hsl(var(--tech-glow)/.12)] backdrop-blur-[10px] animate-cadence-fade-down" aria-hidden="true">
          <Crosshair size={16} /> {APP_COPY.screenshotSelection.hint}
        </div>
        <div className="screenshot-selection-toolbar fixed bottom-7 left-1/2 z-[3] flex -translate-x-1/2 items-center gap-[9px] rounded-[14px] border border-border bg-card/[.96] px-2 py-2 text-xs text-muted-foreground shadow-cadence-toolbar backdrop-blur-[12px] animate-cadence-fade-up" onPointerDown={(event) => event.stopPropagation()}>
          <span className="whitespace-nowrap pl-[5px]">{hasSelection ? APP_COPY.screenshotSelection.selectedSize(selection!.width, selection!.height) : APP_COPY.screenshotSelection.cancelWithEsc}</span>
          {error && <strong className="max-w-[280px] text-[11px] font-semibold text-destructive">{error}</strong>}
          <Button variant="ghost" size="sm" onClick={() => void cancel()}>
            <X size={15} /> {APP_COPY.screenshotSelection.actions.cancel}
          </Button>
          <Button size="sm" onClick={confirm} disabled={!hasSelection || busy}>
            {busy ? <LoaderCircle className="animate-spin" size={15} /> : <ScanLine size={15} />}
            {busy ? APP_COPY.screenshotSelection.actions.submitted : APP_COPY.screenshotSelection.actions.recognizeSelection}
          </Button>
        </div>
      </div>
    </main>
  );
}
