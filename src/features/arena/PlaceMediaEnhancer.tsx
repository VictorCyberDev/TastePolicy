"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import "./place-media.css";

type PlaceMedia = {
  status: "available";
  source: "wikimedia-commons";
  presentationOnly: true;
  classification: "LOCATION_CONTEXT";
  searchQuery: string;
  caption: string;
  image: {
    url: string;
    title: string;
    creator: string;
    license: string;
    licenseUrl: string;
    landingUrl: string;
  };
};

type Target = {
  portrait: HTMLElement;
  name: string;
  address: string;
};

function currentTarget(): Target | null {
  const card = document.querySelector<HTMLElement>(".placeCard");
  const portrait = card?.querySelector<HTMLElement>(".placePortrait");
  const name = card
    ?.querySelector<HTMLElement>(".placeContent > h3")
    ?.textContent?.trim();
  const meta = card?.querySelectorAll<HTMLElement>(".placeMeta > span");
  const address =
    meta && meta.length > 1 ? (meta[1].textContent?.trim() ?? "") : "";
  return portrait && name ? { portrait, name, address } : null;
}

function sameTarget(a: Target | null, b: Target | null) {
  return (
    a?.portrait === b?.portrait &&
    a?.name === b?.name &&
    a?.address === b?.address
  );
}

export default function PlaceMediaEnhancer() {
  const [target, setTarget] = useState<Target | null>(null);
  const targetRef = useRef<Target | null>(null);
  const [resolved, setResolved] = useState<{
    target: Target;
    media: PlaceMedia;
  } | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const media = resolved?.target === target ? resolved.media : null;
  const loaded = Boolean(media && loadedUrl === media.image.url);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = currentTarget();
        const previous = targetRef.current;
        if (sameTarget(previous, next)) return;

        // A candidate identity change invalidates presentation media immediately.
        // Clear the old portrait styling before React commits the new target so
        // stale photography can never visually bleed into the next candidate.
        previous?.portrait.classList.remove("hasLicensedPhoto");
        targetRef.current = next;
        setLoadedUrl(null);
        setResolved(null);
        setTarget(next);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      targetRef.current?.portrait.classList.remove("hasLicensedPhoto");
      targetRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const current = target;
    void (async () => {
      const params = new URLSearchParams({ name: current.name });
      if (current.address) params.set("address", current.address);
      try {
        const response = await fetch(`/api/media/place?${params.toString()}`);
        const result = response.ok ? await response.json() : null;
        if (!cancelled) {
          setResolved(
            result?.status === "available" &&
              result.presentationOnly === true &&
              result.classification === "LOCATION_CONTEXT"
              ? { target: current, media: result }
              : null,
          );
        }
      } catch {
        if (!cancelled) setResolved(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    const portrait = target?.portrait;
    if (!portrait) return;
    portrait.classList.toggle("hasLicensedPhoto", loaded);
    return () => portrait.classList.remove("hasLicensedPhoto");
  }, [target, loaded]);

  if (!target || !media) return null;

  return createPortal(
    <>
      {/* Wikimedia Commons media is presentation only; it is never Qloo evidence. */}
      <img
        key={media.image.url}
        className="licensedPlacePhoto"
        style={{ visibility: loaded ? "visible" : "hidden" }}
        onLoad={() => setLoadedUrl(media.image.url)}
        src={media.image.url}
        alt={`Visual context: ${media.image.title}. Exact property not verified.`}
        referrerPolicy="no-referrer"
        onError={() => {
          setResolved(null);
          setLoadedUrl(null);
        }}
      />
      {loaded && <span className="licensedPhotoShade" aria-hidden="true" />}
      {loaded && (
        <>
          <div
            className="licensedPhotoCredit"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <a href={media.image.landingUrl} target="_blank" rel="noreferrer">
              Photo: {media.image.creator} · Wikimedia Commons
            </a>
            {" · displayed cropped · "}
            <a href={media.image.licenseUrl} target="_blank" rel="noreferrer">
              {media.image.license}
            </a>
          </div>
          <span className="licensedPhotoLabel">
            {media.caption} · presentation only, not Qloo evidence
          </span>
        </>
      )}
    </>,
    target.portrait,
  );
}
