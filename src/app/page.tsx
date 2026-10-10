const modules = [
  "ContextGraph",
  "TastePolicy Engine",
  "Cultural Receipts",
  "TasteTrajectory",
  "TasteBench",
];
export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-current/15 pb-6">
        <span className="font-semibold tracking-tight">TastePolicy /</span>
        <span className="rounded-full border border-current/20 px-4 py-2 text-xs">
          Phase 0 — Engineering Foundation
        </span>
      </header>
      <section className="py-16 sm:py-24" aria-labelledby="title">
        <p className="mb-6 text-xs font-semibold uppercase tracking-widest text-teal-700 dark:text-teal-300">
          The human behind the agent
        </p>
        <h1
          id="title"
          className="text-5xl font-semibold tracking-tight sm:text-7xl"
        >
          TastePolicy
        </h1>
        <p className="mt-6 max-w-2xl text-2xl leading-snug sm:text-3xl">
          Cultural intelligence and authorization for autonomous agents.
        </p>
        <p className="mt-8 max-w-xl leading-relaxed opacity-70">
          Permissions say what an agent can do. Cultural alignment asks whether
          its choices fit the person it represents.
        </p>
      </section>
      <section aria-labelledby="status">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="status" className="text-lg font-semibold">
            Architecture status
          </h2>
          <p className="text-sm opacity-65">
            Foundation established. Product development ahead.
          </p>
        </div>
        <ul className="divide-y divide-current/15 border-y border-current/15">
          {modules.map((name) => (
            <li
              key={name}
              className="flex items-center justify-between gap-4 py-5"
            >
              <span>{name}</span>
              <span className="text-xs uppercase tracking-wider opacity-60">
                Planned
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm leading-relaxed opacity-65">
          TastePolicy does not yet evaluate actions. Qloo integration, policy
          decisions and cultural receipts will be added in later milestones.
        </p>
      </section>
      <footer className="mt-16 flex flex-wrap justify-between gap-4 text-xs opacity-65">
        <span>Open source · Apache 2.0</span>
        <a
          className="underline underline-offset-4"
          href="https://github.com/VictorCyberDev/TastePolicy"
        >
          Explore the engineering foundation
        </a>
      </footer>
    </main>
  );
}
