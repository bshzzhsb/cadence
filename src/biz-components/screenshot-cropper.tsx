import { useEffect, useRef, useState } from "react";
import { Crop, X } from "lucide-react";
import { Button } from "@/components/button";
import { APP_COPY } from "@/lib/copy";

interface Point { x: number; y: number }

export function ScreenshotCropper({ image, onCancel, onConfirm }: { image: string; onCancel: () => void; onConfirm: (cropped: string) => Promise<void> }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const handler = (event: KeyboardEvent) => event.key === "Escape" && onCancel(); window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onCancel]);
  const point = (event: React.PointerEvent): Point => { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) }; };
  const selection = start && end ? { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) } : null;

  const confirm = async () => {
    const element = imageRef.current; if (!element) return;
    setBusy(true);
    const chosen = selection && selection.width > 8 && selection.height > 8 ? selection : { left: 0, top: 0, width: element.clientWidth, height: element.clientHeight };
    const scaleX = element.naturalWidth / element.clientWidth; const scaleY = element.naturalHeight / element.clientHeight;
    const canvas = document.createElement("canvas"); canvas.width = Math.round(chosen.width * scaleX); canvas.height = Math.round(chosen.height * scaleY);
    canvas.getContext("2d")?.drawImage(element, chosen.left * scaleX, chosen.top * scaleY, chosen.width * scaleX, chosen.height * scaleY, 0, 0, canvas.width, canvas.height);
    await onConfirm(canvas.toDataURL("image/jpeg", 0.85)); setBusy(false);
  };

  return <div className="dialog-backdrop"><section className="crop-dialog" role="dialog" aria-modal="true" aria-label={APP_COPY.screenshotCropper.dialogLabel}>
    <header><div><strong><Crop size={16} /> {APP_COPY.screenshotCropper.title}</strong><p>{APP_COPY.screenshotCropper.body}</p></div><Button variant="ghost" size="icon" onClick={onCancel} aria-label={APP_COPY.screenshotCropper.close}><X size={18} /></Button></header>
    <div className="crop-stage" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const value = point(event); setStart(value); setEnd(value); setDragging(true); }} onPointerMove={(event) => dragging && setEnd(point(event))} onPointerUp={() => setDragging(false)}>
      <img ref={imageRef} src={image} alt={APP_COPY.screenshotCropper.imageAlt} draggable={false} />
      {selection && <span className="crop-selection" style={{ left: selection.left, top: selection.top, width: selection.width, height: selection.height }} />}
    </div>
    <footer><Button variant="ghost" onClick={onCancel}>{APP_COPY.screenshotCropper.cancel}</Button><Button onClick={confirm} disabled={busy}>{busy ? APP_COPY.screenshotCropper.recognizing : APP_COPY.screenshotCropper.recognizeSelection}</Button></footer>
  </section></div>;
}
