"use client";

export type BoundaryState =
  | "taste"
  | "discover"
  | "checking"
  | "allow"
  | "ask"
  | "reject"
  | "pause"
  | "handoff";

// THE BOUNDARY: the line between taste (colour, left) and permission
// (structure, right). Its position and form carry the journey: taste leads
// during discovery, the line sweeps while checking, then resolves into the
// decision. Decorative; the stage progress list carries the semantics.
export default function Boundary({ state }: { state: BoundaryState }) {
  return (
    <div className="boundary" data-boundary={state} aria-hidden="true">
      <span className="bTaste">
        <em>Taste</em>
      </span>
      <span className="bLine" />
      <span className="bPermission">
        <em>Permission</em>
      </span>
    </div>
  );
}
