"use client";

import { useState } from "react";
import type { PlaceMediaItem } from "@/server/open/types";
import "./explore.css";

// A genuine 360° capture shown as its full-width panorama you scroll across.
// It only appears for a picture the provider itself marks panoramic. The Exit
// button returns focus to the page, so the panorama never traps keyboard users.
export default function PanoramaStrip({
  item,
  place,
  onClose,
}: {
  item: PlaceMediaItem;
  place: string;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  return (
    <section className="tp-pano" aria-label={`360° panorama near ${place}`}>
      <div
        className="tp-pano-scroll"
        tabIndex={0}
        role="region"
        aria-label="360° panorama. Scroll sideways or use the arrow keys to look around."
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={`360° panorama${item.relation === "AREA_CONTEXT" ? " of the area around" : " near"} ${place}`}
          referrerPolicy="no-referrer"
          decoding="async"
          onLoad={() => setReady(true)}
        />
      </div>
      {!ready && (
        <p className="tp-muted" role="status">
          Loading a large panorama
          {item.width && item.width > 8000 ? " (several MB)" : ""}…
        </p>
      )}
      <div className="tp-seq-controls">
        <button onClick={onClose}>Exit panorama</button>
        {item.landingUrl && (
          <a
            className="tp-btn"
            data-variant="ghost"
            data-size="sm"
            href={item.viewerUrl ?? item.landingUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open in{" "}
            {item.provider === "panoramax"
              ? "Panoramax"
              : item.provider === "kartaview"
                ? "KartaView"
                : "provider"}
          </a>
        )}
      </div>
      <p className="tp-gallery-credit">
        {item.attribution}
        {item.capturedAt ? ` · ${item.capturedAt}` : ""} · {item.license}
        {item.relation === "AREA_CONTEXT"
          ? " · Captured nearby, not at the door"
          : ""}
      </p>
    </section>
  );
}
