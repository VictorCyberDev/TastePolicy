"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { OpenPlaceContext } from "@/server/open/context";
import type { MapState } from "./JourneyMap";
import PanoramaStrip from "./PanoramaStrip";
import SequenceViewer from "./SequenceViewer";
import JourneyLine from "@/components/brand/JourneyLine";
import "./explore.css";

// The map and its WebGL/CSS payload load only when the person asks for it.
const JourneyMap = dynamic(() => import("./JourneyMap"), {
  ssr: false,
  loading: () => (
    <p className="tp-muted" role="status">
      Loading the map…
    </p>
  ),
});

const km = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
const WHY: Record<string, string> = {
  not_configured: "no routing provider is configured here",
  timeout: "the routing provider didn't answer in time",
  provider_error: "the routing provider is unavailable",
  invalid_response: "the routing provider's answer wasn't usable",
  no_origin: "no starting point was given",
  no_destination: "the place couldn't be located",
  blocked_host: "the routing provider is unavailable",
};

export default function ExplorePanel({
  context,
  name,
  address: entityAddress,
  mapState,
}: {
  context: OpenPlaceContext;
  name: string;
  address?: string;
  mapState: MapState;
}) {
  const [panel, setPanel] = useState<null | "journey" | "approach" | "look">(
    null,
  );
  const [mapFailed, setMapFailed] = useState(false);
  const o = context.open;
  const dest = o.map ? { ...o.map.center, label: name } : null;
  if (!dest && !o.sequence && !o.panorama) return null;
  const toggle = (p: "journey" | "approach" | "look") =>
    setPanel(panel === p ? null : p);
  const address = entityAddress ?? context.place?.address;
  return (
    <div className="tp-explore">
      <div
        className="tp-explore-actions"
        role="group"
        aria-label="Explore the place"
      >
        {dest && (
          <button
            aria-expanded={panel === "journey"}
            onClick={() => toggle("journey")}
          >
            See the journey
          </button>
        )}
        {o.sequence && (
          <button
            aria-expanded={panel === "approach"}
            onClick={() => toggle("approach")}
          >
            See the approach
          </button>
        )}
        {o.panorama && (
          <button
            aria-expanded={panel === "look"}
            onClick={() => toggle("look")}
          >
            Look around
          </button>
        )}
      </div>

      {panel === "journey" && dest && (
        <div className="tp-journey-panel">
          {!mapFailed ? (
            <JourneyMap
              destination={dest}
              origin={
                o.originPoint
                  ? { ...o.originPoint, label: o.originLabel ?? "Start" }
                  : undefined
              }
              route={o.route ? { geometry: o.route.geometry } : undefined}
              state={mapState}
              onFail={() => setMapFailed(true)}
            />
          ) : (
            o.route && (
              <JourneyLine
                geometry={o.route.geometry}
                minutes={o.route.minutes}
                meters={o.route.meters}
                originLabel={o.originLabel}
                destinationLabel={name}
              />
            )
          )}
          <dl className="tp-facts-list">
            <div>
              <dt className="tp-section-title">Destination</dt>
              <dd>
                {name}
                {address ? ` · ${address}` : ""}
              </dd>
            </div>
            {o.route ? (
              <div>
                <dt className="tp-section-title">Walking route</dt>
                <dd>
                  {o.route.minutes} min · {km(o.route.meters)} from{" "}
                  {o.route.originLabel}. Route time only: it says nothing about
                  terrain, slopes or obstacles.
                </dd>
              </div>
            ) : (
              <div>
                <dt className="tp-section-title">Travel time</dt>
                <dd>
                  Not confirmed: {WHY[o.routeUnavailable ?? "provider_error"]}.
                  {o.straightLineMeters !== undefined
                    ? ` For orientation only, it is about ${km(o.straightLineMeters)} in a straight line from ${o.originLabel ?? "the start"}, which is not a walking route.`
                    : ""}
                </dd>
              </div>
            )}
          </dl>
          <p className="tp-gallery-credit">
            Map: OpenFreeMap · © OpenMapTiles · Data © OpenStreetMap
            contributors
            {o.route ? " · Route: openrouteservice (HeiGIT)" : ""}
          </p>
        </div>
      )}
      {panel === "approach" && o.sequence && (
        <SequenceViewer
          frames={o.sequence.frames}
          place={name}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "look" && o.panorama && (
        <PanoramaStrip
          item={o.panorama}
          place={name}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
