import { CAPABILITIES, STATUS_LABEL, type Availability } from "./status";

const ORDER: Availability[] = [
  "AVAILABLE",
  "NOT_VERIFIED",
  "ROADMAP",
  "NOT_IMPLEMENTED",
];
// Grouped, labelled text; status is never carried by colour alone.
export default function CapabilityTable() {
  return (
    <section aria-labelledby="status">
      <h2 id="status">What exists today</h2>
      {ORDER.map((s) => {
        const rows = CAPABILITIES.filter((c) => c.status === s);
        return rows.length ? (
          <div key={s}>
            <h3>{STATUS_LABEL[s]}</h3>
            <ul>
              {rows.map((c) => (
                <li key={c.name}>
                  <strong>{c.name}.</strong> {c.note}
                </li>
              ))}
            </ul>
          </div>
        ) : null;
      })}
    </section>
  );
}
