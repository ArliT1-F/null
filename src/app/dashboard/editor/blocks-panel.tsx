"use client";

import { useState } from "react";
import { BLOCK_TYPES, BLOCK_TYPE_LABELS, MAX_BLOCKS, blockSchema, type ProfileBlock } from "@/lib/profile-config";
import type { EditorState } from "./editor-store";

const field = "w-full rounded border border-ink-200 bg-transparent p-2 text-xs dark:border-white/20";

/** Ordered layers and inspector. Reordering also supports keyboard-accessible buttons. */
export function BlocksPanel({ store }: { store: EditorState }) {
  const [selected, select] = useState<string | null>(null);
  const [dragged, drag] = useState<string | null>(null);
  const [error, setError] = useState("");
  const blocks = store.draft.blocks;
  const block = blocks.find((b) => b.id === selected);
  function update(next: ProfileBlock[]) { store.set("blocks", next); }
  function change(patch: Record<string, unknown>) {
    if (!block || block.locked) return;
    const result = blockSchema.safeParse({ ...block, props: { ...block.props, ...patch } });
    if (!result.success) { setError(result.error.issues[0]?.message ?? "Invalid value"); return; }
    setError("");
    update(blocks.map((b) => b.id === block.id ? result.data : b));
  }
  function move(id: string, to: number) {
    const from = blocks.findIndex((b) => b.id === id);
    if (from < 0 || blocks[from].locked || to < 0 || to >= blocks.length || blocks[to].locked) return;
    const next = [...blocks];
    next.splice(to, 0, next.splice(from, 1)[0]);
    update(next);
  }
  function text(label: string, key: string, value: string, maxLength: number) {
    return <label className="block space-y-1">{label}<textarea key={`${block?.id}-${key}`} className={field} defaultValue={value} maxLength={maxLength} onBlur={(e) => change({ [key]: e.target.value })} /></label>;
  }
  function choice(label: string, key: string, value: string | number, options: readonly (string | number)[]) {
    return <label className="block space-y-1">{label}<select className={field} value={value} onChange={(e) => change({ [key]: typeof value === "number" ? Number(e.target.value) : e.target.value })}>{options.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>;
  }
  return <div className="space-y-4 p-4 text-xs">
    <p>Add content blocks. Drag layers or use the arrow buttons to reorder. Text and URLs save when you leave the field.</p>
    <div className="flex flex-wrap gap-2">{BLOCK_TYPES.map((type) => <button key={type} disabled={blocks.length >= MAX_BLOCKS} className="rounded border px-2 py-1 disabled:opacity-40" onClick={() => {
      const next = blockSchema.parse({ id: crypto.randomUUID(), type, props: {} });
      update([...blocks, next]); select(next.id);
    }}>+ {BLOCK_TYPE_LABELS[type]}</button>)}</div>
    <ol aria-label="Block layers" className="space-y-2">{blocks.map((b, i) => <li key={b.id} draggable={!b.locked} onDragStart={() => drag(b.id)} onDragEnd={() => drag(null)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragged) move(dragged, i); drag(null); }} className="rounded border p-2">
      <button aria-pressed={selected === b.id} onClick={() => { select(b.id); setError(""); }} className="mb-2 block font-medium">{i + 1}. {BLOCK_TYPE_LABELS[b.type]}{!b.visible ? " (hidden)" : ""}{b.locked ? " (locked)" : ""}</button>
      <div className="flex flex-wrap gap-3">
        <button aria-label={`Move block ${i + 1} up`} disabled={b.locked || i === 0} onClick={() => move(b.id, i - 1)}>↑</button>
        <button aria-label={`Move block ${i + 1} down`} disabled={b.locked || i === blocks.length - 1} onClick={() => move(b.id, i + 1)}>↓</button>
        <button disabled={b.locked} onClick={() => update(blocks.map((x) => x.id === b.id ? { ...x, visible: !x.visible } : x))}>{b.visible ? "Hide" : "Show"}</button>
        <button onClick={() => update(blocks.map((x) => x.id === b.id ? { ...x, locked: !x.locked } : x))}>{b.locked ? "Unlock" : "Lock"}</button>
        <button disabled={b.locked} onClick={() => { update(blocks.filter((x) => x.id !== b.id)); if (selected === b.id) select(null); }}>Delete</button>
      </div>
    </li>)}</ol>
    {block && <fieldset disabled={block.locked} className="space-y-3 border-t pt-3" key={block.id}>
      <legend className="font-medium">{BLOCK_TYPE_LABELS[block.type]} settings</legend>
      {block.type === "text" && <>{text("Text", "content", block.props.content, 2000)}{choice("Alignment", "align", block.props.align, ["left", "center", "right"])}{choice("Size", "size", block.props.size, ["sm", "md", "lg"])}</>}
      {block.type === "image" && <>{text("Image URL (HTTPS or uploaded media path)", "src", block.props.src, 512)}{text("Alternative text", "alt", block.props.alt, 200)}{text("Caption", "caption", block.props.caption, 300)}{choice("Corners", "radius", block.props.radius, ["none", "sm", "md", "lg", "xl", "full"])}</>}
      {block.type === "gallery" && <>{choice("Columns", "columns", block.props.columns, [1, 2, 3])}<label className="block">Image URLs (one per line, up to six)<textarea className={field} defaultValue={block.props.images.map((img) => img.src).join("\n")} onBlur={(e) => change({ images: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).map((src) => ({ src, alt: block.props.images.find((img) => img.src === src)?.alt ?? "" })) })} /></label>{block.props.images.map((img, i) => <label className="block" key={`${img.src}-${i}`}>Alternative text {i + 1}<input className={field} defaultValue={img.alt} maxLength={200} onBlur={(e) => change({ images: block.props.images.map((image, index) => index === i ? { ...image, alt: e.target.value } : image) })} /></label>)}</>}
      {block.type === "divider" && <>{choice("Style", "style", block.props.style, ["line", "dots", "spacing"])}{choice("Spacing", "spacing", block.props.spacing, [0, 8, 16, 24, 32, 48, 64])}</>}
      {block.type === "embed" && <>{text("Provider URL (YouTube, Vimeo, Spotify or SoundCloud)", "url", block.props.url, 2048)}{text("Accessible title", "title", block.props.title, 200)}</>}
    </fieldset>}
    {error && <p role="alert" className="text-red-500">{error}</p>}
  </div>;
}
