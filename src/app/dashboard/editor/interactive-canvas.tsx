"use client";

import { useMemo, useRef, useState } from "react";
import { BackgroundVideo } from "@/components/profile/background-video";
import {
  entranceClass,
  frameToStyle,
  ProfileBlockView,
  ProfileIdentityHeader,
  ProfileLinksNav,
  type RenderableProfile,
} from "@/components/profile/profile-renderer";
import { backgroundImageFor, backgroundVideoFor, videoMimeFor } from "@/lib/background-image";
import {
  resolveBlockFrame,
  snapMove,
  snapResize,
  type AlignmentGuide,
  type MeasuredRect,
  type ResizeHandle,
} from "@/lib/canvas-guides";
import {
  BLOCK_TYPE_LABELS,
  DEFAULT_IDENTITY_FRAME,
  DEFAULT_LINKS_FRAME,
  filterVisibleBlocks,
  isBlockLocked,
  type CanvasFrame,
  type ProfileConfig,
} from "@/lib/profile-config";
import { buildProfileCss } from "@/lib/profile-css";
import { buildSandboxedProfileDocument } from "@/lib/sandbox";
import { cn } from "@/lib/utils";
import type { EditorSelection, UpdateOptions } from "./editor-store";

export type DeviceMode = "desktop" | "tablet" | "mobile";

const RESIZE_HANDLES: readonly { handle: ResizeHandle; className: string; label: string }[] = [
  {
    handle: "e",
    label: "Resize width right",
    className: "right-[-5px] top-1/2 -translate-y-1/2 h-5 w-2.5 cursor-ew-resize rounded-sm",
  },
  {
    handle: "w",
    label: "Resize width left",
    className: "left-[-5px] top-1/2 -translate-y-1/2 h-5 w-2.5 cursor-ew-resize rounded-sm",
  },
  {
    handle: "s",
    label: "Resize height",
    className: "bottom-[-5px] left-1/2 -translate-x-1/2 h-2.5 w-5 cursor-ns-resize rounded-sm",
  },
  {
    handle: "se",
    label: "Resize corner",
    className: "bottom-[-5px] right-[-5px] size-3 cursor-nwse-resize rounded-full",
  },
];

type DragTarget =
  | { kind: "identity" }
  | { kind: "links" }
  | { kind: "block"; id: string };

/**
 * Interactive visual canvas + isolated sandbox preview (V2.2, V2.3, V2.5).
 *
 *  - Uses `@container null-profile` so Desktop / Tablet (768px) / Mobile (390px)
 *    frames trigger genuine breakpoint overrides inside the editor viewport.
 *  - In Canvas mode, elements can be clicked, dragged, and resized directly
 *    with real-time magnetic alignment guides, grid snapping, and coordinate HUD.
 *  - In Stack mode, blocks and profile sections are click-selectable and blocks
 *    can be dragged to reorder directly on the card.
 *  - When sandbox preview is active (or while editing custom CSS), renders inside
 *    `<iframe sandbox="">` (opaque origin, scripts disabled) so untrusted CSS
 *    never touches the authenticated editor DOM.
 */
export function InteractiveCanvas({
  profile,
  device,
  selection,
  onSelect,
  onUpdate,
  customCss,
  sandboxPreview,
  onOpenInspector,
}: {
  profile: RenderableProfile;
  device: DeviceMode;
  selection: EditorSelection;
  onSelect: (next: EditorSelection) => void;
  onUpdate: (recipe: (d: ProfileConfig) => ProfileConfig, opts?: UpdateOptions | string) => void;
  customCss: string;
  sandboxPreview: boolean;
  onOpenInspector?: () => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);
  const [hud, setHud] = useState<string | null>(null);
  const [stackDragId, setStackDragId] = useState<string | null>(null);
  const [stackOverId, setStackOverId] = useState<string | null>(null);

  const { config } = profile;
  const css = useMemo(() => buildProfileCss(config), [config]);

  const sandboxSrcDoc = useMemo(() => {
    if (!sandboxPreview) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : undefined;
    return buildSandboxedProfileDocument({
      profile,
      customCss,
      mediaOrigin: origin,
      preview: true,
    });
  }, [sandboxPreview, profile, customCss]);

  const frameSizeClass =
    device === "mobile"
      ? "mx-auto w-[390px] max-w-full min-h-[700px] rounded-[2rem] border-4 border-ink-800/80 shadow-elevated dark:border-white/15"
      : device === "tablet"
        ? "mx-auto w-[768px] max-w-full min-h-[680px] rounded-2xl border-2 border-ink-400/60 shadow-elevated dark:border-white/15"
        : "w-full min-h-[660px] rounded-2xl border border-ink-200/80 shadow-elevated dark:border-white/10";

  // Opaque-origin sandboxed preview (for custom CSS or visitor-accurate inspection).
  if (sandboxPreview) {
    return (
      <div className={cn("relative overflow-hidden transition-[width] duration-200", frameSizeClass)}>
        <iframe
          title="Isolated profile preview"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={sandboxSrcDoc}
          className="block h-[720px] w-full border-0"
        />
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
          Isolated sandbox preview
        </span>
      </div>
    );
  }

  const visibleLinks = profile.links.filter((l) => l.visible !== false);
  const visibleBlocks = filterVisibleBlocks(config.blocks ?? [], config.groups ?? []);
  const bgImage = backgroundImageFor(config.theme.background);
  const bgVideo = backgroundVideoFor(config.theme.background);
  const entrance = entranceClass(config.theme.effects.entrance);
  const stagger = config.theme.effects.stagger ? "vp-stagger" : "";
  const isCanvas = config.layout.mode === "canvas";
  const isMobileCanvasStacked =
    isCanvas &&
    device === "mobile" &&
    (config.breakpoints.mobile.canvasStack ?? config.canvas.mobileStack ?? true);
  const isTabletCanvasStacked =
    isCanvas && device === "tablet" && config.breakpoints.tablet.canvasStack === true;
  const interactiveFreeform = isCanvas && !isMobileCanvasStacked && !isTabletCanvasStacked;

  function setItemEl(key: string, el: HTMLElement | null) {
    if (el) itemRefs.current.set(key, el);
    else itemRefs.current.delete(key);
  }

  function targetKey(t: DragTarget): string {
    return t.kind === "block" ? `block:${t.id}` : t.kind;
  }

  function getTargetFrame(d: ProfileConfig, t: DragTarget): CanvasFrame {
    if (t.kind === "identity") return d.canvas.identityFrame ?? DEFAULT_IDENTITY_FRAME;
    if (t.kind === "links") return d.canvas.linksFrame ?? DEFAULT_LINKS_FRAME;
    const idx = d.blocks.findIndex((b) => b.id === t.id);
    const blk = d.blocks[idx];
    return blk ? resolveBlockFrame(blk, idx) : DEFAULT_IDENTITY_FRAME;
  }

  function collectMeasuredRects(): MeasuredRect[] {
    const rects: MeasuredRect[] = [];
    const idFrame = config.canvas.identityFrame ?? DEFAULT_IDENTITY_FRAME;
    const idH = itemRefs.current.get("identity")?.offsetHeight ?? idFrame.h ?? 210;
    rects.push({ id: "identity", x: idFrame.x, y: idFrame.y, w: idFrame.w, h: idH });

    if (visibleLinks.length > 0) {
      const lnFrame = config.canvas.linksFrame ?? DEFAULT_LINKS_FRAME;
      const lnH = itemRefs.current.get("links")?.offsetHeight ?? lnFrame.h ?? 150;
      rects.push({ id: "links", x: lnFrame.x, y: lnFrame.y, w: lnFrame.w, h: lnH });
    }

    visibleBlocks.forEach((blk, idx) => {
      const fr = resolveBlockFrame(blk, idx);
      const key = `block:${blk.id}`;
      const h = itemRefs.current.get(key)?.offsetHeight ?? fr.h ?? 90;
      rects.push({ id: key, x: fr.x, y: fr.y, w: fr.w, h });
    });
    return rects;
  }

  function commitFrame(t: DragTarget, next: CanvasFrame, label: string) {
    onUpdate(
      (d) => {
        if (t.kind === "identity") {
          return { ...d, canvas: { ...d.canvas, identityFrame: next } };
        }
        if (t.kind === "links") {
          return { ...d, canvas: { ...d.canvas, linksFrame: next } };
        }
        return {
          ...d,
          blocks: d.blocks.map((b) => (b.id === t.id ? { ...b, frame: next } : b)),
        };
      },
      { label, coalesce: true },
    );
  }

  function startPointerMove(event: React.PointerEvent, target: DragTarget, locked: boolean) {
    event.stopPropagation();
    onSelect(target);
    onOpenInspector?.();
    if (!interactiveFreeform || locked || event.button !== 0) return;

    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();

    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width < 100) return;

    const initial = getTargetFrame(config, target);
    const selfKey = targetKey(target);
    const peers = collectMeasuredRects();
    const selfMeasuredH = itemRefs.current.get(selfKey)?.offsetHeight ?? initial.h ?? 100;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    function onMove(ev: PointerEvent) {
      const dxPx = ev.clientX - startX;
      const dyPx = ev.clientY - startY;
      if (!moved && Math.hypot(dxPx, dyPx) < 3) return;
      moved = true;

      const dxPct = (dxPx / stageRect.width) * 100;
      const candidate: MeasuredRect = {
        id: selfKey,
        x: initial.x + dxPct,
        y: initial.y + dyPx,
        w: initial.w,
        h: selfMeasuredH,
      };
      const snapped = snapMove(candidate, peers, {
        gridSnap: config.canvas.gridSnap,
        stageWidth: stageRect.width,
        stageHeight: config.canvas.height,
        disableSnap: ev.altKey,
      });
      setGuides(snapped.guides);
      const next: CanvasFrame = { ...initial, x: snapped.x, y: snapped.y };
      setHud(`X ${next.x}% · Y ${next.y}px`);
      commitFrame(target, next, "Move on canvas");
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setGuides([]);
      setHud(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function startPointerResize(
    event: React.PointerEvent,
    target: DragTarget,
    handle: ResizeHandle,
    locked: boolean,
  ) {
    event.stopPropagation();
    event.preventDefault();
    if (!interactiveFreeform || locked || event.button !== 0) return;

    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width < 100) return;

    const initial = getTargetFrame(config, target);
    const selfKey = targetKey(target);
    const peers = collectMeasuredRects();
    const initialMeasuredH = itemRefs.current.get(selfKey)?.offsetHeight ?? initial.h ?? 100;
    const startX = event.clientX;
    const startY = event.clientY;

    function onMove(ev: PointerEvent) {
      const dxPct = ((ev.clientX - startX) / stageRect.width) * 100;
      const dyPx = ev.clientY - startY;
      const { frame: next, guides: nextGuides } = snapResize(
        initial,
        dxPct,
        dyPx,
        handle,
        peers,
        selfKey,
        initialMeasuredH,
        {
          gridSnap: config.canvas.gridSnap,
          stageWidth: stageRect.width,
          stageHeight: config.canvas.height,
          disableSnap: ev.altKey,
        },
      );
      setGuides(nextGuides);
      setHud(`W ${next.w}% · H ${next.h !== null ? `${next.h}px` : "auto"}`);
      commitFrame(target, next, "Resize on canvas");
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setGuides([]);
      setHud(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function renderCanvasChrome(
    target: DragTarget,
    label: string,
    selected: boolean,
    locked: boolean,
  ) {
    if (!interactiveFreeform) return null;
    return (
      <>
        {selected && (
          <span className="pointer-events-none absolute -top-6 left-0 z-50 flex items-center gap-1 whitespace-nowrap rounded bg-brand-500 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-ink-950 shadow">
            {label}
            {locked ? " · Locked" : ""}
          </span>
        )}
        {selected &&
          !locked &&
          RESIZE_HANDLES.map((h) => (
            <button
              key={h.handle}
              type="button"
              aria-label={h.label}
              onPointerDown={(e) => startPointerResize(e, target, h.handle, locked)}
              className={cn(
                "absolute z-50 border border-ink-950/60 bg-brand-400 shadow transition-transform hover:scale-110",
                h.className,
              )}
            />
          ))}
      </>
    );
  }

  function renderStackBlocks() {
    if (visibleBlocks.length === 0) return null;
    return (
      <div className="vp-blocks">
        {visibleBlocks.map((block) => {
          const isSelected = selection?.kind === "block" && selection.id === block.id;
          const locked = isBlockLocked(block, config.groups);
          const isOver = stackOverId === block.id && stackDragId !== block.id;
          return (
            <div
              key={block.id}
              draggable={!locked}
              onClick={(e) => {
                e.stopPropagation();
                onSelect({ kind: "block", id: block.id });
                onOpenInspector?.();
              }}
              onDragStart={(e) => {
                if (locked) {
                  e.preventDefault();
                  return;
                }
                setStackDragId(block.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", block.id);
              }}
              onDragOver={(e) => {
                if (!stackDragId || stackDragId === block.id) return;
                e.preventDefault();
                setStackOverId(block.id);
              }}
              onDragLeave={() => {
                if (stackOverId === block.id) setStackOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (stackDragId && stackDragId !== block.id) {
                  onUpdate((d) => {
                    const from = d.blocks.findIndex((b) => b.id === stackDragId);
                    const to = d.blocks.findIndex((b) => b.id === block.id);
                    if (from < 0 || to < 0 || isBlockLocked(d.blocks[from], d.groups)) return d;
                    const copy = [...d.blocks];
                    const [moved] = copy.splice(from, 1);
                    copy.splice(to, 0, moved);
                    return { ...d, blocks: copy };
                  }, "Reorder block on canvas");
                }
                setStackDragId(null);
                setStackOverId(null);
              }}
              onDragEnd={() => {
                setStackDragId(null);
                setStackOverId(null);
              }}
              className={cn(
                "group/cb relative rounded-lg transition-shadow",
                !locked && "cursor-grab active:cursor-grabbing",
                isSelected
                  ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-transparent"
                  : "hover:ring-1 hover:ring-white/35",
                isOver && "ring-2 ring-sky-400",
                stackDragId === block.id && "opacity-45",
              )}
            >
              {isSelected && (
                <span className="pointer-events-none absolute -top-5 left-1 z-20 rounded bg-brand-400 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-ink-950 shadow">
                  {block.label || BLOCK_TYPE_LABELS[block.type]}
                  {locked ? " · Locked" : ""}
                </span>
              )}
              <ProfileBlockView block={block} preview />
            </div>
          );
        })}
      </div>
    );
  }

  const gridBgStyle =
    interactiveFreeform && config.canvas.gridSnap > 0
      ? {
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.16) 1px, transparent 1px)",
          backgroundSize: `${config.canvas.gridSnap * 2}px ${config.canvas.gridSnap * 2}px`,
        }
      : undefined;

  const idSelected = selection?.kind === "identity";
  const linksSelected = selection?.kind === "links";
  const blocksBelow = config.layout.blocksPosition === "below-links";

  return (
    <div
      className={cn("relative overflow-hidden transition-[width] duration-200", frameSizeClass)}
      style={{ containerType: "inline-size", containerName: "null-profile" }}
      onClick={() => onSelect(null)}
    >
      <div
        className="null-profile"
        style={{ minHeight: "100%" }}
        data-preview="true"
        data-layout={config.layout.mode}
      >
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {bgImage && <div className="vp-bg" aria-hidden="true" />}
        {bgVideo && (
          <BackgroundVideo src={bgVideo} mimeType={videoMimeFor(bgVideo)} poster={bgImage} />
        )}

        {isCanvas ? (
          <div
            ref={stageRef}
            className={cn(
              "vp-canvas",
              entrance,
              stagger,
              interactiveFreeform && "rounded-xl outline-1 outline-dashed outline-white/15",
            )}
            style={gridBgStyle}
          >
            {/* Magnetic alignment guide overlays */}
            {interactiveFreeform &&
              guides.map((g, i) =>
                g.axis === "x" ? (
                  <div
                    key={`gx-${g.position}-${i}`}
                    aria-hidden="true"
                    style={{ left: `${g.position}%` }}
                    className={cn(
                      "pointer-events-none absolute inset-y-0 z-40 w-px",
                      g.kind === "center" ? "bg-rose-400" : "bg-sky-400/90",
                    )}
                  />
                ) : (
                  <div
                    key={`gy-${g.position}-${i}`}
                    aria-hidden="true"
                    style={{ top: `${g.position}px` }}
                    className={cn(
                      "pointer-events-none absolute inset-x-0 z-40 h-px",
                      g.kind === "center" ? "bg-rose-400" : "bg-sky-400/90",
                    )}
                  />
                ),
              )}

            {/* Identity card */}
            <section
              ref={(el) => setItemEl("identity", el)}
              onPointerDown={(e) => startPointerMove(e, { kind: "identity" }, false)}
              onClick={(e) => e.stopPropagation()}
              style={frameToStyle(config.canvas.identityFrame ?? DEFAULT_IDENTITY_FRAME)}
              aria-label="Profile"
              className={cn(
                "vp-canvas-item vp-surface select-none",
                interactiveFreeform && "cursor-move",
                idSelected
                  ? "ring-2 ring-brand-400"
                  : interactiveFreeform && "hover:ring-1 hover:ring-white/35",
              )}
            >
              {renderCanvasChrome({ kind: "identity" }, "Identity", idSelected, false)}
              <ProfileIdentityHeader profile={profile} />
            </section>

            {/* Links panel */}
            <div
              ref={(el) => setItemEl("links", el)}
              onPointerDown={(e) => startPointerMove(e, { kind: "links" }, false)}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              style={frameToStyle(config.canvas.linksFrame ?? DEFAULT_LINKS_FRAME)}
              className={cn(
                "vp-canvas-item vp-surface select-none",
                interactiveFreeform && "cursor-move",
                linksSelected
                  ? "ring-2 ring-brand-400"
                  : interactiveFreeform && "hover:ring-1 hover:ring-white/35",
              )}
            >
              {renderCanvasChrome({ kind: "links" }, "Links", linksSelected, false)}
              <div className="pointer-events-none">
                <ProfileLinksNav links={visibleLinks} preview showEmptyState />
              </div>
            </div>

            {/* Component blocks */}
            {visibleBlocks.map((block, index) => {
              const frame = resolveBlockFrame(block, index);
              const isSelected = selection?.kind === "block" && selection.id === block.id;
              const locked = isBlockLocked(block, config.groups);
              const needsSurface = block.type === "text";
              return (
                <div
                  key={block.id}
                  ref={(el) => setItemEl(`block:${block.id}`, el)}
                  onPointerDown={(e) => startPointerMove(e, { kind: "block", id: block.id }, locked)}
                  onClick={(e) => e.stopPropagation()}
                  style={frameToStyle(frame)}
                  className={cn(
                    "vp-canvas-item select-none",
                    needsSurface && "vp-surface",
                    frame.h !== null && "vp-canvas-item--sized",
                    interactiveFreeform && (locked ? "cursor-default" : "cursor-move"),
                    isSelected
                      ? "ring-2 ring-brand-400"
                      : interactiveFreeform && "hover:ring-1 hover:ring-white/35",
                  )}
                >
                  {renderCanvasChrome(
                    { kind: "block", id: block.id },
                    block.label || BLOCK_TYPE_LABELS[block.type],
                    isSelected,
                    locked,
                  )}
                  <div className="pointer-events-none h-full">
                    <ProfileBlockView block={block} preview />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <article className={`vp-card ${entrance} ${stagger}`.trim()}>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onSelect({ kind: "identity" });
                onOpenInspector?.();
              }}
              className={cn(
                "cursor-pointer rounded-xl transition-shadow",
                idSelected
                  ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-transparent"
                  : "hover:ring-1 hover:ring-white/25",
              )}
            >
              <ProfileIdentityHeader profile={profile} />
            </div>

            {!blocksBelow && renderStackBlocks()}

            <div
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onSelect({ kind: "links" });
                onOpenInspector?.();
              }}
              className={cn(
                "cursor-pointer rounded-xl transition-shadow",
                linksSelected
                  ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-transparent"
                  : "hover:ring-1 hover:ring-white/25",
              )}
            >
              <div className="pointer-events-none">
                <ProfileLinksNav
                  links={visibleLinks}
                  preview
                  showEmptyState={visibleBlocks.length === 0}
                />
              </div>
            </div>

            {blocksBelow && renderStackBlocks()}

            <footer className="vp-footer">
              <span style={{ opacity: 0.7 }}>null</span>
            </footer>
          </article>
        )}
      </div>

      {/* Live drag/resize coordinate HUD */}
      {hud && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-black/80 px-3 py-1 font-mono text-[11px] text-white shadow-lg backdrop-blur">
          {hud}
        </div>
      )}

      {isMobileCanvasStacked && (
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
          Auto-stacked for mobile
        </span>
      )}
    </div>
  );
}
