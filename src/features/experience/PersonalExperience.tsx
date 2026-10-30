"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "@/components/brand/brand.css";
import HumanShell from "@/components/layout/HumanShell";
import AssistedChoice from "./AssistedChoice";
import type { Persona } from "./personas";
import type { PersonalLink } from "./useAssistedChoice";
import { useProductState } from "@/features/product/useProductState";
import { usePolicyApi } from "@/features/policy/usePolicyApi";
import { SUBJECTIVE_ACTIONS, type SubjectiveAction } from "@/lib/policy/types";
import type { Requirement } from "@/lib/requirements/types";
import type { QlooEntity } from "@/types/domain";

type Loaded = { persona: Persona; link: Omit<PersonalLink, "call"> };
const TYPE: Record<string, string> = {
  artist: "Music",
  movie: "Film",
  tv_show: "TV",
  book: "Books",
  brand: "Brands",
  place: "Places",
  destination: "Destinations",
};

// The real thing, for a real person: their saved taste, what matters to them
// and their saved limit. A visitor is asked to sign in; someone who has not
// finished setup is sent to finish it. Never an example person.
export default function PersonalExperience() {
  const { state } = useProductState();
  const call = usePolicyApi();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (state.kind !== "ACTIVE") return;
    const ref = state.passport.passportRef;
    let live = true;
    void (async () => {
      try {
        const [taste, policy] = await Promise.all([
          call<{
            stateVersion: number;
            anchors: QlooEntity[];
            needs: {
              requirements: Requirement[];
              origin: { label: string; lat: number; lng: number } | null;
            };
          }>("taste", { passportRef: ref }),
          call<{
            active: { document?: { actions?: { default?: string } } } | null;
          }>("policy-get", { passportRef: ref }),
        ]);
        const saved = policy.active?.document?.actions?.default;
        const ceiling: SubjectiveAction = SUBJECTIVE_ACTIONS.includes(
          saved as SubjectiveAction,
        )
          ? (saved as SubjectiveAction)
          : "ADD_TO_DRAFT";
        if (!live) return;
        setLoaded({
          link: {
            passportRef: ref,
            stateVersion: taste.stateVersion,
            anchors: taste.anchors,
          },
          persona: {
            id: "you",
            path: "/experience",
            name: state.passport.displayLabel,
            tagline: "Your taste, your rules.",
            story: "",
            quote: "",
            anchors: taste.anchors.map((a) => ({
              query: a.name,
              expectedType: a.type,
              caption: TYPE[a.type] ?? a.type,
            })),
            requirements: taste.needs.requirements,
            answers: {},
            ...(taste.needs.origin
              ? {
                  origin: {
                    lat: taste.needs.origin.lat,
                    lng: taste.needs.origin.lng,
                    label: taste.needs.origin.label,
                  },
                }
              : {}),
            ceiling,
            contextKey: "my_outing",
            cta: "Find somewhere that feels like me",
          },
        });
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : "Could not load your taste.",
          );
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  if (loaded)
    return (
      <AssistedChoice
        persona={loaded.persona}
        personal={{ ...loaded.link, call }}
      />
    );
  return (
    <HumanShell active="/experience">
      <main className="tp-onb">
        {state.kind === "LOADING" || (state.kind === "ACTIVE" && !error) ? (
          <p role="status">Opening your taste…</p>
        ) : state.kind === "VISITOR" ? (
          <>
            <h1>Sign in to find places for you.</h1>
            <p>
              This page uses your own saved taste. If you&apos;d rather see how
              it works first, try the example.
            </p>
            <p className="tp-onb-actions">
              <Link className="tp-btn" data-variant="spectrum" href="/login">
                Sign in
              </Link>
              <Link className="tp-btn" data-variant="ghost" href="/signup">
                Create an account
              </Link>
              <Link
                className="tp-btn"
                data-variant="ghost"
                href="/demo/margaret"
              >
                See an example
              </Link>
            </p>
          </>
        ) : state.kind === "AUTHENTICATED_UNONBOARDED" ? (
          <>
            <h1>Let&apos;s set up your taste first.</h1>
            <p>It takes about two minutes, and then this page is yours.</p>
            <p>
              <Link
                className="tp-btn"
                data-variant="spectrum"
                href="/onboarding"
              >
                Set up my taste
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1>We couldn&apos;t open your taste.</h1>
            <p role="alert">{error || "The service is unavailable."}</p>
          </>
        )}
      </main>
    </HumanShell>
  );
}
