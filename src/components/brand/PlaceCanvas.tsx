"use client";

import { useEffect, useState } from "react";
import "./brand.css";
import { spectrumColor, spectrumOf } from "./Tasteprint";
import { tasteImageSrc, TASTE_IMAGE_LABEL } from "@/features/arena/portrait";

export interface ProviderPhoto {
  src: string;
  attributions: { displayName: string; uri?: string }[];
  provider: string;
}
type Media =
  | { kind: "provider"; photo: ProviderPhoto }
  | {
      kind: "commons";
      url: string;
      creator: string;
      license: string;
      licenseUrl: string;
      landingUrl: string;
      caption: string;
    }
  | { kind: "authored" };

// Image fallback ladder (never mixes sources, always labels the one in use):
//   1. authoritative place photo, only when identity was matched upstream
//   2. licensed Wikimedia Commons visual context (not verified to be the venue)
//   3. authored Taste image (illustrative, never property photography)
export function PlaceMedia({
  id,
  name,
  address,
  providerPhoto,
}: {
  id: string;
  name: string;
  address?: string;
  providerPhoto?: ProviderPhoto;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [commons, setCommons] = useState<{ key: string; media: Media } | null>(
    null,
  );
  const key = `${name}|${address ?? ""}`;
  const providerUsable = providerPhoto && failed !== providerPhoto.src;

  useEffect(() => {
    if (providerUsable) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ name, address: address ?? "" });
    fetch(`/api/media/place?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d?.status === "available" && d.image?.url)
          setCommons({
            key,
            media: {
              kind: "commons",
              url: d.image.url,
              creator: d.image.creator,
              license: d.image.license,
              licenseUrl: d.image.licenseUrl,
              landingUrl: d.image.landingUrl,
              caption: d.caption,
            },
          });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [key, name, address, providerUsable]);

  const media: Media = providerUsable
    ? { kind: "provider", photo: providerPhoto }
    : commons?.key === key
      ? commons.media
      : { kind: "authored" };
  const a = spectrumColor(spectrumOf(id));
  const b = spectrumColor(spectrumOf(id + "b"));
  return (
    <div
      className="tp-place-media"
      style={{ "--a": a, "--b": b } as React.CSSProperties}
      data-media={media.kind}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={media.kind}
        src={
          media.kind === "provider"
            ? media.photo.src
            : media.kind === "commons"
              ? media.url
              : tasteImageSrc(id)
        }
        alt={
          media.kind === "authored"
            ? `Illustration in the colours of ${name}'s taste profile. Not a photo of the place.`
            : `Photo related to ${name}`
        }
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => media.kind === "provider" && setFailed(media.photo.src)}
      />
      <p className="tp-place-credit">
        {media.kind === "provider" ? (
          <>
            Photo via {media.photo.provider}
            {media.photo.attributions.map((x) => (
              <span key={x.displayName}>
                {" · "}
                {x.uri ? (
                  <a href={x.uri} target="_blank" rel="noreferrer noopener">
                    {x.displayName}
                  </a>
                ) : (
                  x.displayName
                )}
              </span>
            ))}
          </>
        ) : media.kind === "commons" ? (
          <>
            {media.caption} ·{" "}
            <a
              href={media.landingUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {media.creator}
            </a>{" "}
            ·{" "}
            <a
              href={media.licenseUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {media.license}
            </a>
          </>
        ) : (
          TASTE_IMAGE_LABEL
        )}
      </p>
    </div>
  );
}

export default function PlaceCanvas({
  id,
  name,
  locality,
  providerPhoto,
  address,
  hero,
  children,
}: {
  id: string;
  name: string;
  locality?: string;
  address?: string;
  providerPhoto?: ProviderPhoto;
  // A richer hero (real gallery) replaces the single-image fallback ladder.
  hero?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <article className="tp-place" aria-label={name}>
      {hero ?? (
        <PlaceMedia
          id={id}
          name={name}
          address={address}
          providerPhoto={providerPhoto}
        />
      )}
      <div className="tp-place-body">
        <header>
          <h3>{name}</h3>
          {locality && <p className="tp-place-loc">{locality}</p>}
        </header>
        {children}
      </div>
    </article>
  );
}
