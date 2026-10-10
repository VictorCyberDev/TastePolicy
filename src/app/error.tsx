"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="p-12">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="my-4">Please try again.</p>
      <button className="rounded border px-4 py-2" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
