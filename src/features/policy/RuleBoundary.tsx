import type { AutonomyLevel } from "@/lib/policy/types";

// THE BOUNDARY, matured for the control plane: the line between taste (colour,
// left) and permission (structure, right). The further right the line sits, the more
// taste alone decides; further left, you decide. Decorative; the labelled setting carries the meaning.
export default function RuleBoundary({ level }: { level: AutonomyLevel }) {
  return (
    <div className="ruleBoundary" data-level={level} aria-hidden="true">
      <span className="rbTaste">
        <em>Taste</em>
      </span>
      <span className="rbLine" />
      <span className="rbPermission">
        <em>Permission</em>
      </span>
    </div>
  );
}
