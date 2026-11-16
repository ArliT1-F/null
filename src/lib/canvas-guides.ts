import type { CanvasFrame, ProfileBlock } from "./profile-config";

/**
 * Pure geometry, snapping, and alignment-guide solver for the visual canvas.
 *
 * Kept free of React and DOM imports so every calculation is deterministic and
 * unit-tested directly. `x` and `w` are stage-width percentages (0..100);
 * `y` and `h` are stage pixels.
 */

export type AlignmentGuide = {
  axis: "x" | "y";
  /** Percentage (0..100) for `axis: "x"`, pixels for `axis: "y"`. */
  position: number;
  kind: "center" | "margin" | "item";
  label?: string;
};

export type MeasuredRect = {
  id: string;
  /** Left percentage (0..100). */
  x: number;
  /** Top pixels. */
  y: number;
  /** Width percentage (10..100). */
  w: number;
  /** Rendered height in pixels (explicit frame height or measured DOM height). */
  h: number;
};

export type SnapOptions = {
  /** Snap tolerance on the X axis, in percentage points (default 1.2%). */
  thresholdX?: number;
  /** Snap tolerance on the Y axis, in pixels (default 7px). */
  thresholdY?: number;
  /** Grid step in pixels for Y (and converted for X via `stageWidth`); 0 disables. */
  gridSnap?: number;
  /** Current canvas stage width in pixels, used to convert gridSnap to %. */
  stageWidth?: number;
  /** Current canvas stage height in pixels. */
  stageHeight?: number;
  /** When true (e.g. holding Alt), skip magnetic guides and grid snapping. */
  disableSnap?: boolean;
};

export function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Clamps a canvas frame inside legal schema & stage bounds. */
export function clampFrame(frame: CanvasFrame, stageHeight = 2400): CanvasFrame {
  const w = roundPct(Math.min(100, Math.max(10, frame.w)));
  const maxX = Math.min(95, Math.max(0, 100 - w));
  const x = roundPct(Math.min(maxX, Math.max(0, frame.x)));
  const maxY = Math.min(2200, Math.max(0, Math.round(stageHeight - 24)));
  const y = Math.round(Math.min(maxY, Math.max(0, frame.y)));
  const h = frame.h === null ? null : Math.round(Math.min(1200, Math.max(24, frame.h)));
  const z = Math.round(Math.min(100, Math.max(1, frame.z)));
  return { x, y, w, h, z };
}

/**
 * Generates a clean, non-overlapping default canvas frame for a block that
 * does not yet have explicit coordinates (e.g. created in stack mode).
 */
export function defaultFrameForBlock(index: number, baseY = 470): CanvasFrame {
  return clampFrame({
    x: 20,
    y: baseY + index * 110,
    w: 60,
    h: null,
    z: Math.min(100, 30 + index),
  });
}

export function resolveBlockFrame(block: ProfileBlock, index: number): CanvasFrame {
  return block.frame ? clampFrame(block.frame) : defaultFrameForBlock(index);
}

/** Ensures every block has an explicit frame and returns the needed canvas height. */
export function materializeCanvasFrames(
  blocks: ProfileBlock[],
  currentHeight: number,
): { blocks: ProfileBlock[]; height: number } {
  let maxBottom = currentHeight;
  const next = blocks.map((block, index) => {
    const frame = block.frame ? clampFrame(block.frame) : defaultFrameForBlock(index);
    const estBottom = frame.y + (frame.h ?? 110) + 48;
    if (estBottom > maxBottom) maxBottom = estBottom;
    return block.frame ? block : { ...block, frame };
  });
  return { blocks: next, height: Math.min(2400, Math.max(420, Math.round(maxBottom))) };
}

function snapToGrid(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/**
 * Computes snapped position and active alignment guides while dragging an item.
 * Checks canvas center (50%), safe margins (5%, 95%), and every peer item's
 * left, center, right, top, middle, and bottom edges.
 */
export function snapMove(
  moving: MeasuredRect,
  peers: readonly MeasuredRect[],
  options: SnapOptions = {},
): { x: number; y: number; guides: AlignmentGuide[] } {
  const stageHeight = options.stageHeight ?? 720;
  const stageWidth = options.stageWidth ?? 880;
  const grid = options.gridSnap ?? 0;

  if (options.disableSnap) {
    const clamped = clampFrame({ x: moving.x, y: moving.y, w: moving.w, h: null, z: 10 }, stageHeight);
    return { x: clamped.x, y: clamped.y, guides: [] };
  }

  const thresholdX = options.thresholdX ?? 1.2;
  const thresholdY = options.thresholdY ?? 7;

  // Candidate X guide lines (percentages).
  const xTargets: AlignmentGuide[] = [
    { axis: "x", position: 50, kind: "center", label: "Center" },
    { axis: "x", position: 5, kind: "margin" },
    { axis: "x", position: 95, kind: "margin" },
  ];
  // Candidate Y guide lines (pixels).
  const yTargets: AlignmentGuide[] = [{ axis: "y", position: 36, kind: "margin" }];
  if (stageHeight > 0) {
    yTargets.push({ axis: "y", position: Math.round(stageHeight / 2), kind: "center", label: "Middle" });
  }

  for (const peer of peers) {
    if (peer.id === moving.id) continue;
    xTargets.push(
      { axis: "x", position: roundPct(peer.x), kind: "item" },
      { axis: "x", position: roundPct(peer.x + peer.w / 2), kind: "item" },
      { axis: "x", position: roundPct(peer.x + peer.w), kind: "item" },
    );
    yTargets.push(
      { axis: "y", position: Math.round(peer.y), kind: "item" },
      { axis: "y", position: Math.round(peer.y + peer.h / 2), kind: "item" },
      { axis: "y", position: Math.round(peer.y + peer.h), kind: "item" },
    );
  }

  const guides: AlignmentGuide[] = [];

  // Test moving left, center, and right against every X guide line.
  const movingAnchorsX = [
    { offset: 0 },
    { offset: moving.w / 2 },
    { offset: moving.w },
  ];
  let bestDx = thresholdX + 0.001;
  let snappedX: number | null = null;
  let matchedX: AlignmentGuide | null = null;

  for (const anchor of movingAnchorsX) {
    const edge = moving.x + anchor.offset;
    for (const target of xTargets) {
      const dist = Math.abs(edge - target.position);
      if (dist < bestDx) {
        bestDx = dist;
        snappedX = target.position - anchor.offset;
        matchedX = target;
      }
    }
  }

  let finalX: number;
  if (snappedX !== null && matchedX) {
    finalX = snappedX;
    guides.push(matchedX);
  } else if (grid > 0 && stageWidth > 0) {
    const gridPct = (grid / stageWidth) * 100;
    finalX = snapToGrid(moving.x, gridPct);
  } else {
    finalX = moving.x;
  }

  // Test moving top, middle, and bottom against every Y guide line.
  const movingAnchorsY = [
    { offset: 0 },
    { offset: moving.h / 2 },
    { offset: moving.h },
  ];
  let bestDy = thresholdY + 0.001;
  let snappedY: number | null = null;
  let matchedY: AlignmentGuide | null = null;

  for (const anchor of movingAnchorsY) {
    const edge = moving.y + anchor.offset;
    for (const target of yTargets) {
      const dist = Math.abs(edge - target.position);
      if (dist < bestDy) {
        bestDy = dist;
        snappedY = target.position - anchor.offset;
        matchedY = target;
      }
    }
  }

  let finalY: number;
  if (snappedY !== null && matchedY) {
    finalY = snappedY;
    guides.push(matchedY);
  } else if (grid > 0) {
    finalY = snapToGrid(moving.y, grid);
  } else {
    finalY = moving.y;
  }

  const clamped = clampFrame({ x: finalX, y: finalY, w: moving.w, h: null, z: 10 }, stageHeight);
  return { x: clamped.x, y: clamped.y, guides };
}

export type ResizeHandle = "e" | "w" | "s" | "se";

/**
 * Computes snapped frame and active alignment guides while resizing an item.
 */
export function snapResize(
  initial: CanvasFrame,
  deltaXPct: number,
  deltaYPx: number,
  handle: ResizeHandle,
  peers: readonly MeasuredRect[],
  selfId: string,
  initialMeasuredHeight: number,
  options: SnapOptions = {},
): { frame: CanvasFrame; guides: AlignmentGuide[] } {
  const stageHeight = options.stageHeight ?? 720;
  const stageWidth = options.stageWidth ?? 880;
  const grid = options.gridSnap ?? 0;
  const thresholdX = options.thresholdX ?? 1.2;
  const thresholdY = options.thresholdY ?? 7;

  let x = initial.x;
  let w = initial.w;
  let h = initial.h;
  const guides: AlignmentGuide[] = [];

  const rightEdge = initial.x + initial.w;

  const xTargets: AlignmentGuide[] = [
    { axis: "x", position: 5, kind: "margin" },
    { axis: "x", position: 50, kind: "center", label: "Center" },
    { axis: "x", position: 95, kind: "margin" },
  ];
  const yTargets: AlignmentGuide[] = [];

  for (const peer of peers) {
    if (peer.id === selfId) continue;
    xTargets.push(
      { axis: "x", position: roundPct(peer.x), kind: "item" },
      { axis: "x", position: roundPct(peer.x + peer.w), kind: "item" },
    );
    yTargets.push(
      { axis: "y", position: Math.round(peer.y), kind: "item" },
      { axis: "y", position: Math.round(peer.y + peer.h), kind: "item" },
    );
  }

  if (handle === "e" || handle === "se") {
    let nextRight = Math.min(100, Math.max(x + 10, rightEdge + deltaXPct));
    if (!options.disableSnap) {
      let best = thresholdX + 0.001;
      let match: AlignmentGuide | null = null;
      for (const target of xTargets) {
        if (target.position < x + 10) continue;
        const d = Math.abs(nextRight - target.position);
        if (d < best) {
          best = d;
          match = target;
        }
      }
      if (match) {
        nextRight = match.position;
        guides.push(match);
      } else if (grid > 0 && stageWidth > 0) {
        nextRight = snapToGrid(nextRight, (grid / stageWidth) * 100);
      }
    }
    w = nextRight - x;
  } else if (handle === "w") {
    let nextLeft = Math.max(0, Math.min(rightEdge - 10, initial.x + deltaXPct));
    if (!options.disableSnap) {
      let best = thresholdX + 0.001;
      let match: AlignmentGuide | null = null;
      for (const target of xTargets) {
        if (target.position > rightEdge - 10) continue;
        const d = Math.abs(nextLeft - target.position);
        if (d < best) {
          best = d;
          match = target;
        }
      }
      if (match) {
        nextLeft = match.position;
        guides.push(match);
      } else if (grid > 0 && stageWidth > 0) {
        nextLeft = snapToGrid(nextLeft, (grid / stageWidth) * 100);
      }
    }
    x = nextLeft;
    w = rightEdge - nextLeft;
  }

  if (handle === "s" || handle === "se") {
    const startH = initial.h ?? Math.max(40, initialMeasuredHeight);
    let nextBottom = initial.y + Math.max(24, startH + deltaYPx);
    if (!options.disableSnap) {
      let best = thresholdY + 0.001;
      let match: AlignmentGuide | null = null;
      for (const target of yTargets) {
        if (target.position < initial.y + 24) continue;
        const d = Math.abs(nextBottom - target.position);
        if (d < best) {
          best = d;
          match = target;
        }
      }
      if (match) {
        nextBottom = match.position;
        guides.push(match);
      } else if (grid > 0) {
        nextBottom = snapToGrid(nextBottom, grid);
      }
    }
    h = Math.max(24, Math.min(1200, Math.round(nextBottom - initial.y)));
  }

  return {
    frame: clampFrame({ x, y: initial.y, w, h, z: initial.z }, stageHeight),
    guides,
  };
}
