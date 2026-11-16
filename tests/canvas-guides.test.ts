import { describe, expect, it } from "vitest";
import {
  clampFrame,
  defaultFrameForBlock,
  materializeCanvasFrames,
  resolveBlockFrame,
  snapMove,
  snapResize,
} from "@/lib/canvas-guides";
import { blockSchema, createBlockId } from "@/lib/profile-config";

describe("canvas-guides: clamping, snapping, alignment & resizing", () => {
  it("clamps frames cleanly inside canvas boundaries", () => {
    const clamped = clampFrame({ x: 85, y: -40, w: 40, h: 10, z: 999 }, 900);
    expect(clamped.w).toBe(40);
    expect(clamped.x).toBe(60); // 100 - w
    expect(clamped.y).toBe(0);
    expect(clamped.h).toBeGreaterThanOrEqual(24);
    expect(clamped.z).toBeLessThanOrEqual(100);
  });

  it("snaps a dragged block horizontally to the 50% canvas center with a vertical guide", () => {
    const result = snapMove(
      { id: "self", x: 10.6, y: 200, w: 80, h: 100 }, // center is 50.6%, snaps to 50%
      [],
      { stageWidth: 600, stageHeight: 900, gridSnap: 8 },
    );
    expect(result.x).toBe(10); // center strictly at 50%
    expect(result.guides.some((g) => g.axis === "x" && g.position === 50)).toBe(true);
  });

  it("snaps a dragged block's left edge and top edge to sibling rects", () => {
    const peer = { id: "peer", x: 15, y: 320, w: 40, h: 100 };
    const result = snapMove(
      { id: "self", x: 15.5, y: 324, w: 30, h: 80 },
      [peer],
      { stageWidth: 640, stageHeight: 960, gridSnap: 0 },
    );
    expect(result.x).toBe(15);
    expect(result.y).toBe(320);
    expect(result.guides.some((g) => g.axis === "x" && g.position === 15)).toBe(true);
    expect(result.guides.some((g) => g.axis === "y" && g.position === 320)).toBe(true);
  });

  it("bypasses grid and smart-guide snapping when disableSnap (Alt) is held", () => {
    const result = snapMove(
      { id: "self", x: 10.6, y: 203, w: 80, h: 90 },
      [{ id: "p", x: 10, y: 200, w: 80, h: 100 }],
      { stageWidth: 600, stageHeight: 900, gridSnap: 16, disableSnap: true },
    );
    expect(result.x).toBe(10.6);
    expect(result.y).toBe(203);
    expect(result.guides).toEqual([]);
  });

  it("resizes frames with edge snapping and minimum size protection", () => {
    const start = { x: 10, y: 200, w: 40, h: 120, z: 3 };
    const peer = { id: "p", x: 10, y: 400, w: 80, h: 90 }; // right edge at 90%, top at 400px

    // deltaXPct = 39.5 -> proposed right edge 89.5%, snaps to peer right edge 90% (w = 80)
    // deltaYPx = 77 -> proposed height 197 (bottom 397), snaps to peer top 400 (h = 200)
    const resized = snapResize(start, 39.5, 77, "se", [peer], "self", 120, {
      stageWidth: 600,
      stageHeight: 900,
      gridSnap: 8,
    });

    expect(resized.frame.x).toBe(10);
    expect(resized.frame.w).toBe(80);
    expect(resized.frame.h).toBe(200);
    expect(resized.guides.some((g) => g.axis === "x" && g.position === 90)).toBe(true);
    expect(resized.guides.some((g) => g.axis === "y" && g.position === 400)).toBe(true);

    // West handle cannot shrink past minimum width, and right edge stays anchored at 50%
    const shrunk = snapResize(start, 80, 0, "w", [], "self", 120, {
      stageWidth: 600,
      stageHeight: 900,
      gridSnap: 0,
    });
    expect(shrunk.frame.w).toBe(10);
    expect(shrunk.frame.x + shrunk.frame.w).toBeCloseTo(50, 1);
  });

  it("materializes deterministic non-overlapping frames when switching stack → canvas", () => {
    const customFrame = { x: 20, y: 150, w: 60, h: 80, z: 9 };
    const b1 = blockSchema.parse({ id: createBlockId(), type: "text", frame: customFrame, props: {} });
    const b2 = blockSchema.parse({ id: createBlockId(), type: "image", props: {} });
    const b3 = blockSchema.parse({ id: createBlockId(), type: "embed", props: {} });

    const res = materializeCanvasFrames([b1, b2, b3], 600);
    expect(res.blocks[0].frame).toEqual(customFrame);
    expect(res.blocks[1].frame).toBeTruthy();
    expect(res.blocks[2].frame).toBeTruthy();
    expect(res.blocks[2].frame!.y).toBeGreaterThan(res.blocks[1].frame!.y);
    expect(res.height).toBeGreaterThan(res.blocks[2].frame!.y);

    expect(resolveBlockFrame(b1, 0)).toEqual(customFrame);
    expect(resolveBlockFrame(b2, 1)).toEqual(defaultFrameForBlock(1));
  });
});
