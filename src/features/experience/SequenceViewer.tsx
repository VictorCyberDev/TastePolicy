"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaceMediaItem } from "@/server/open/types";
import "./explore.css";

// "See the approach": consecutive real frames of one capture sequence. It is a
// street sequence, not a video: nothing plays until the person asks, and with
// reduced motion it never advances on its own.
export default function SequenceViewer({
  frames,
  place,
  onClose,
}: {
  frames: PlaceMediaItem[];
  place: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  // Rendered only after a click, so the browser value is read once up front.
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setI((n) => {
        if (n >= frames.length - 1) {
          setPlaying(false);
          return n;
        }
        return n + 1;
      });
    }, 1700);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, frames.length]);
  const f = frames[i];
  const next = frames[i + 1];
  return (
    <section className="tp-seq" aria-label={`Street sequence toward ${place}`}>
      <div className="tp-seq-stage" data-playing={playing && !reduced}>
        {frames.map((fr, n) => (
          // Only the current and next frame are in the DOM image cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={fr.providerId}
            src={n === i || fr === next ? fr.url : undefined}
            alt={
              n === i
                ? `Frame ${n + 1} of ${frames.length} of the street sequence near ${place}`
                : ""
            }
            aria-hidden={n !== i}
            data-active={n === i}
            referrerPolicy="no-referrer"
            decoding="async"
            onLoad={() => setLoaded((l) => new Set(l).add(n))}
          />
        ))}
        {!loaded.has(i) && (
          <span className="tp-seq-wait" role="status">
            Loading frame…
          </span>
        )}
        <span className="tp-gallery-tag" data-relation={f.relation}>
          Street sequence · frame {i + 1} of {frames.length}
        </span>
      </div>
      <div
        className="tp-seq-controls"
        role="group"
        aria-label="Sequence controls"
      >
        <button
          onClick={() => setI(Math.max(0, i - 1))}
          disabled={i === 0}
          aria-label="Previous frame"
        >
          ‹ Back
        </button>
        <button
          onClick={() =>
            i >= frames.length - 1
              ? (setI(0), setPlaying(!reduced))
              : setPlaying(!playing)
          }
          disabled={reduced}
          aria-pressed={playing}
        >
          {playing ? "Pause" : i >= frames.length - 1 ? "Replay" : "Play"}
        </button>
        <button
          onClick={() => setI(Math.min(frames.length - 1, i + 1))}
          disabled={i >= frames.length - 1}
          aria-label="Next frame"
        >
          Forward ›
        </button>
        <button onClick={onClose}>Close</button>
      </div>
      {reduced && (
        <p className="tp-muted">
          Reduced motion is on, so the sequence moves only when you press Back
          or Forward.
        </p>
      )}
      <p className="tp-gallery-credit" aria-live="polite">
        {f.attribution}
        {f.capturedAt ? ` · ${f.capturedAt}` : ""} · {f.license}
        {f.landingUrl && (
          <>
            {" · "}
            <a href={f.landingUrl} target="_blank" rel="noreferrer noopener">
              Source
            </a>
          </>
        )}
      </p>
      <p className="tp-muted">
        Real photographs taken along the street at different moments. They show
        the way there, not whether the place is accessible.
      </p>
    </section>
  );
}
