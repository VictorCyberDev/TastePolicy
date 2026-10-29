"use client";

import { useState } from "react";
import type { PlaceMediaItem } from "@/server/open/types";
import { itemAlt, relationLabel } from "./relation";
import "./explore.css";

// Real pictures, each with its own relationship label and attribution. The
// label is the point: a street photo near a venue is never presented as the
// venue. Pictures are presentation only and say nothing about access.
export default function PlaceGallery({
  items,
  place,
  area,
}: {
  items: PlaceMediaItem[];
  place: string;
  area?: string;
}) {
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const usable = items.filter((i) => !broken.has(i.providerId));
  if (!usable.length) return null;
  const current = usable[Math.min(index, usable.length - 1)];
  const go = (n: number) => setIndex((n + usable.length) % usable.length);
  return (
    <figure
      className="tp-gallery"
      aria-roledescription="gallery"
      aria-label={`Photos of and around ${place}`}
    >
      <div className="tp-gallery-hero" data-relation={current.relation}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current.providerId}
          src={current.url}
          alt={itemAlt(current, place, area)}
          referrerPolicy="no-referrer"
          decoding="async"
          onError={() => setBroken((b) => new Set(b).add(current.providerId))}
        />
        <span className="tp-gallery-tag" data-relation={current.relation}>
          {relationLabel(current.relation, place, area)}
        </span>
        {usable.length > 1 && (
          <>
            <button
              className="tp-gallery-nav"
              data-dir="prev"
              onClick={() => go(index - 1)}
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              className="tp-gallery-nav"
              data-dir="next"
              onClick={() => go(index + 1)}
              aria-label="Next photo"
            >
              ›
            </button>
          </>
        )}
      </div>
      <figcaption className="tp-gallery-credit">
        {current.attribution}
        {current.capturedAt ? ` · ${current.capturedAt}` : ""}
        {current.license ? (
          <>
            {" · "}
            {current.licenseUrl ? (
              <a
                href={current.licenseUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {current.license}
              </a>
            ) : (
              current.license
            )}
          </>
        ) : null}
        {current.landingUrl && (
          <>
            {" · "}
            <a
              href={current.landingUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Source
            </a>
          </>
        )}
        {usable.length > 1 && (
          <span className="tp-gallery-count" aria-live="polite">
            {" "}
            · {Math.min(index, usable.length - 1) + 1} of {usable.length}
          </span>
        )}
      </figcaption>
      {usable.length > 1 && (
        <ul className="tp-gallery-strip" aria-label="Choose a photo">
          {usable.map((i, n) => (
            <li key={i.providerId}>
              <button
                aria-label={`Photo ${n + 1}: ${relationLabel(i.relation, place, area)}`}
                aria-current={n === index}
                onClick={() => setIndex(n)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={i.thumbUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
