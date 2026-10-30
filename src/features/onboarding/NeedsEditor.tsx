"use client";
import { useState } from "react";
import {
  NEED_COPY,
  type NeedId,
  type NeedSelection,
} from "@/lib/product/needs";

export interface Origin {
  label: string;
  lat: number;
  lng: number;
}

export function NeedsEditor({
  value,
  onChange,
}: {
  value: NeedSelection[];
  onChange: (next: NeedSelection[]) => void;
}) {
  const set = (id: NeedId, patch: Partial<NeedSelection>) =>
    onChange(value.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  return (
    <ul className="tp-need-list">
      {value.map((n) => {
        const c = NEED_COPY[n.id];
        return (
          <li key={n.id} data-on={n.on}>
            <label className="tp-need-main">
              <input
                type="checkbox"
                checked={n.on}
                onChange={(e) => set(n.id, { on: e.target.checked })}
              />
              <span>
                <b>{c.title}</b>
                <small>{c.hint}</small>
              </span>
            </label>
            {n.on && (
              <div className="tp-need-detail">
                {c.options && (
                  <label>
                    {n.id === "budget" ? "Up to" : "At most"}
                    <select
                      value={n.value}
                      onChange={(e) =>
                        set(n.id, { value: Number(e.target.value) })
                      }
                    >
                      {c.options.map((o) => (
                        <option key={o} value={o}>
                          {n.id === "budget" ? `$${o}` : `${o} ${c.unit}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  How firm
                  <select
                    value={n.required ? "hard" : "soft"}
                    onChange={(e) =>
                      set(n.id, { required: e.target.value === "hard" })
                    }
                  >
                    <option value="hard">Required</option>
                    <option value="soft">Nice to have</option>
                  </select>
                </label>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// A typed starting area. We never read the person's location; they type it,
// we show matches, they choose.
export function AreaPicker({
  origin,
  onPick,
}: {
  origin: Origin | null;
  onPick: (o: Origin | null) => void;
}) {
  const [query, setQuery] = useState(""),
    [choices, setChoices] = useState<Origin[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function search() {
    setBusy(true);
    setNotice("");
    setChoices([]);
    try {
      const r = await fetch("/api/places/area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const b = await r.json();
      if (!r.ok || b.status !== "available")
        throw Error("Place search is unavailable right now.");
      setChoices(b.data);
      if (!b.data.length) setNotice("No match. Try a nearby town or suburb.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="tp-area">
      <legend>Where do you usually start from?</legend>
      <p className="tp-muted">
        Optional. A neighbourhood or town is enough. We never use your device
        location.
      </p>
      {origin && (
        <p className="tp-area-set">
          Starting from <b>{origin.label}</b>{" "}
          <button
            type="button"
            className="tp-link"
            onClick={() => onPick(null)}
          >
            Remove
          </button>
        </p>
      )}
      <div className="tp-area-row">
        <label>
          Neighbourhood or town
          <input
            value={query}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="tp-btn"
          data-size="sm"
          disabled={busy || query.trim().length < 2}
          onClick={() => void search()}
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {choices.length > 0 && (
        <ul className="tp-area-choices">
          {choices.map((c) => (
            <li key={`${c.lat},${c.lng}`}>
              <button
                type="button"
                className="tp-link"
                onClick={() => {
                  onPick(c);
                  setChoices([]);
                }}
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
