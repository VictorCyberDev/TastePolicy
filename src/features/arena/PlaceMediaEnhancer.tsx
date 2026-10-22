"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import "./place-media.css";

type PlaceMedia = {
  status: "available";
  source: "openverse";
  image: {
    url: string;
    title: string;
    creator: string;
    license: string;
    licenseVersion: string;
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

export default function PlaceMediaEnhancer() {
  const [target, setTarget] = useState<Target | null>(null);
  const [media, setMedia] = useState<PlaceMedia | null>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = currentTarget();
        setTarget((previous) => {
          if (
            previous?.portrait === next?.portrait &&
            previous?.name === next?.name &&
            previous?.address === next?.address
          ) {
            return previous;
          }
          return next;
        });
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
          setMedia(result?.status === "available" ? result : null);
        }
      } catch {
        if (!cancelled) setMedia(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    const portrait = target?.portrait;
    if (!portrait) return;
    portrait.classList.toggle("hasLicensedPhoto", Boolean(media));
    return () => portrait.classList.remove("hasLicensedPhoto");
  }, [target, media]);

  if (!target || !media) return null;

  return createPortal(
    <>
      {/* Openverse media is presentation only; it is never Qloo evidence. */}
      <img
        className="licensedPlacePhoto"
        src={media.image.url}
        alt={media.image.title || target.name}
        referrerPolicy="no-referrer"
        onError={() => setMedia(null)}
      />
      <span className="licensedPhotoShade" aria-hidden="true" />
      <a
        className="licensedPhotoCredit"
        href={media.image.landingUrl}
        target="_blank"
        rel="noreferrer"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
      >
        Photo: {media.image.creator} · {media.image.license}
        {media.image.licenseVersion ? ` ${media.image.licenseVersion}` : ""} ·
        via Openverse
      </a>
      <span className="licensedPhotoLabel">
        Openly licensed presentation photo · not Qloo evidence
      </span>
    </>,
    target.portrait,
  );
}
