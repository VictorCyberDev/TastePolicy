"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoPoint } from "@/server/open/types";
import "./explore.css";

export type MapState =
  "discover" | "checking" | "ask" | "allow" | "reject" | "unavailable";
// OpenFreeMap needs no key. The style is fetched once and re-coloured into
// the TastePolicy palette; a failure shows a text fallback, never a blank box.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

type Style = {
  layers: { id: string; type: string; paint?: Record<string, unknown> }[];
} & Record<string, unknown>;
function brand(style: Style): Style {
  for (const l of style.layers) {
    const p = (l.paint ??= {});
    if (l.type === "background") p["background-color"] = "#fbf7ef";
    else if (l.id === "water") p["fill-color"] = "#cfd9f5";
    else if (l.id === "park" || l.id === "landcover_wood")
      p["fill-color"] = "#e3efd2";
    else if (l.id === "building") p["fill-color"] = "#efe6d4";
    else if (l.type === "symbol") p["text-color"] = "#4a495e";
  }
  return style;
}

// Progress of the route line per authority state: ASK pauses on the boundary,
// ALLOW completes it, REJECT keeps the geometry but softens the destination.
const reach = (s: MapState) =>
  s === "ask" ? 0.55 : s === "unavailable" ? 0 : 1;

export default function JourneyMap({
  destination,
  origin,
  route,
  state,
  onFail,
}: {
  destination: GeoPoint & { label: string };
  origin?: GeoPoint & { label: string };
  route?: { geometry: [number, number][] };
  state: MapState;
  onFail?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setProgress: (r: number, animate: boolean) => void;
    soften: (v: boolean) => void;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    let map: import("maplibre-gl").Map | undefined;
    let raf = 0;
    (async () => {
      try {
        const [maplibre, res] = await Promise.all([
          import("maplibre-gl"),
          fetch(STYLE_URL, { referrerPolicy: "no-referrer" }),
        ]);
        if (!res.ok || cancelled || !box.current) throw new Error("style");
        const style = brand((await res.json()) as Style);
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        map = new maplibre.Map({
          container: box.current,
          style: style as never,
          center: [destination.lng, destination.lat],
          zoom: 15,
          attributionControl: false,
          cooperativeGestures: true,
        });
        map.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
          "top-right",
        );
        map.addControl(new maplibre.AttributionControl({ compact: true }));
        const pin = (kind: "dest" | "origin", p: GeoPoint, label: string) => {
          const el = document.createElement("div");
          el.className = "tp-pin";
          el.dataset.kind = kind;
          el.setAttribute("role", "img");
          el.setAttribute("aria-label", label);
          new maplibre.Marker({ element: el })
            .setLngLat([p.lng, p.lat])
            .addTo(map!);
          return el;
        };
        const destPin = pin(
          "dest",
          destination,
          `Destination: ${destination.label}`,
        );
        if (origin) pin("origin", origin, `Start: ${origin.label}`);
        map.on("load", () => {
          if (cancelled || !map) return;
          const coords = route?.geometry;
          const bounds = new maplibre.LngLatBounds(
            [destination.lng, destination.lat],
            [destination.lng, destination.lat],
          );
          if (origin) bounds.extend([origin.lng, origin.lat]);
          coords?.forEach((c) => bounds.extend(c));
          if (origin || coords)
            map.fitBounds(bounds, {
              padding: 56,
              maxZoom: 16,
              duration: reduced ? 0 : 900,
            });
          let shown = 0;
          if (coords && coords.length > 1) {
            map.addSource("route", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: [coords[0], coords[0]],
                },
              },
            });
            map.addLayer({
              id: "route-casing",
              type: "line",
              source: "route",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": "#ffffff", "line-width": 11 },
            });
            map.addLayer({
              id: "route-line",
              type: "line",
              source: "route",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": "#6b3fd4", "line-width": 6 },
            });
            map.addLayer({
              id: "route-dash",
              type: "line",
              source: "route",
              layout: { "line-cap": "round" },
              paint: {
                "line-color": "#ef3b1d",
                "line-width": 6,
                "line-dasharray": [0.1, 2.2],
              },
            });
          }
          const draw = (r: number) => {
            shown = r;
            const src = map?.getSource("route") as
              import("maplibre-gl").GeoJSONSource | undefined;
            if (!src || !coords) return;
            const n = Math.max(2, Math.round(coords.length * r));
            src.setData({
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: coords.slice(0, n) },
            });
          };
          api.current = {
            setProgress(target, animate) {
              cancelAnimationFrame(raf);
              if (!animate || reduced || !coords) return draw(target);
              const from = shown,
                t0 = performance.now(),
                dur = 1800 * Math.abs(target - from) + 200;
              const step = (t: number) => {
                const k = Math.min(1, (t - t0) / dur);
                draw(from + (target - from) * (1 - Math.pow(1 - k, 3)));
                if (k < 1) raf = requestAnimationFrame(step);
              };
              raf = requestAnimationFrame(step);
            },
            soften(v) {
              destPin.dataset.soft = String(v);
              if (map?.getLayer("route-line"))
                map.setPaintProperty(
                  "route-line",
                  "line-color",
                  v ? "#9a98ad" : "#6b3fd4",
                );
            },
          };
          api.current.setProgress(reach(stateRef.current), true);
          api.current.soften(stateRef.current === "reject");
          setStatus("ready");
        });
        map.on("error", (e) => {
          // A missed tile is not fatal; only a dead style/WebGL context is.
          if (
            !map?.loaded() &&
            !api.current &&
            String(e?.error?.message ?? "").match(/webgl|style/i)
          ) {
            setStatus("failed");
            onFail?.();
          }
        });
      } catch {
        if (!cancelled) {
          setStatus("failed");
          onFail?.();
        }
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      api.current = null;
      map?.remove();
    };
    // The map is built once per destination/route; state changes only move the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.lat, destination.lng, origin?.lat, origin?.lng, route]);

  useEffect(() => {
    api.current?.setProgress(reach(state), true);
    api.current?.soften(state === "reject");
  }, [state]);

  return (
    <div className="tp-map-wrap">
      {status === "ready" && (
        <span className="tp-map-badge" data-state={state}>
          {state === "ask"
            ? route
              ? "Paused at the boundary"
              : "Waiting for your answer"
            : state === "allow"
              ? "Within what you allowed"
              : state === "reject"
                ? "Stopped: it breaks a need"
                : state === "unavailable"
                  ? "Couldn't check"
                  : "Exploring"}
        </span>
      )}
      <div
        ref={box}
        className="tp-map"
        role="region"
        aria-label={`Map showing ${destination.label}${origin ? ` and ${origin.label}` : ""}`}
        data-testid="journey-map"
        data-ready={status}
      />
      {status === "loading" && (
        <p className="tp-muted" role="status" style={{ padding: 8 }}>
          Loading the map…
        </p>
      )}
      {status === "failed" && (
        <p className="tp-muted" role="status" style={{ padding: 8 }}>
          The map couldn&apos;t load here. The place details below still apply.
        </p>
      )}
    </div>
  );
}
