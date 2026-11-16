"use client";

import { useEffect, useRef, useState } from "react";

type ConnectionHint = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function shouldSuppressAutoplay(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  if (window.matchMedia?.("(prefers-reduced-data: reduce)").matches) return true;
  const conn = (navigator as Navigator & { connection?: ConnectionHint }).connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g") return true;
  return false;
}

/**
 * Progressive video background (V2.4, NUL-9).
 *
 * Only rendered on profiles that actively choose `background.type === "video"`.
 * Defers `<video>` mount until after first paint of the SSR poster image and
 * skips video download entirely when `prefers-reduced-motion`,
 * `prefers-reduced-data`, Data Saver (`connection.saveData`), or 2G is active.
 */
export function BackgroundVideo({
  src,
  mimeType,
  poster,
}: {
  src: string;
  mimeType: "video/mp4" | "video/webm";
  poster?: string | null;
}) {
  const [enabled, setEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const dataQuery = window.matchMedia?.("(prefers-reduced-data: reduce)");
    const conn = (navigator as Navigator & { connection?: ConnectionHint }).connection;

    const update = () => setEnabled(!shouldSuppressAutoplay());
    update();

    motionQuery?.addEventListener?.("change", update);
    dataQuery?.addEventListener?.("change", update);
    conn?.addEventListener?.("change", update);
    return () => {
      motionQuery?.removeEventListener?.("change", update);
      dataQuery?.removeEventListener?.("change", update);
      conn?.removeEventListener?.("change", update);
    };
  }, [src]);

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;

    const onVisibility = () => {
      if (document.hidden) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled, src]);

  if (!enabled) return null;

  return (
    <div className="vp-bg-video-wrap" aria-hidden="true">
      <video
        ref={videoRef}
        key={src}
        className="vp-bg-video"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        poster={poster ?? undefined}
      >
        <source src={src} type={mimeType} />
      </video>
      <div className="vp-bg-dim" />
    </div>
  );
}
