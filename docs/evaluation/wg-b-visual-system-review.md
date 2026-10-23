# WG-B visual system: "Taste is plural. Permission is precise."

Presentation-only change on `/arena/consumer`. No policy, Qloo, Neon/PostgreSQL, state, clarification, repair, receipt, handoff-semantics or `/arena` change; no new route, migration or dependency. Starting head: `85794225665a6a4b5707bb257edf8af5027f97b3`.

## Two visual modes

- **Discovery** (TASTE, confirm, DISCOVER): expressive, editorial, image-led. Instrument Serif display type at large scale, a colour wash drawn from the candidate's two spectrum hues, a tall image-first card.
- **Authorization** (CHECKING and every decision): quiet, exact, structured. Inter, tight tracking, a single rule, neutral ground, one restrained semantic cue (a small outcome disc). Copy is shorter than before.

The shift is visible in layout (centred editorial card to left-aligned column), colour (spectrum wash to neutral), type (serif display to precise sans) and motion (card lock-in to the boundary resolving).

## Taste Spectrum

Neutrals: Ink `#14110f`, Bone `#f3eee4`, Mist `#dfe3e1`, Slate `#3a4650`. Accents: Vermilion, Cobalt, Electric Violet, Saffron, Aqua, Acid Lime, Rose, Coral. Eight fixed pairings (dominant + supporting) are bound to the eight authored images, so each candidate gets one coherent colour world (`data-spectrum`). Acid Lime is used as a fill only, never as text. Light is Bone/Ink; dark inverts to Ink/Bone.

## THE BOUNDARY

A pill-shaped bar that separates **taste** (spectrum colour, left) from **permission** (ruled structure, right). It appears on every stage and changes form with the journey:

| Stage    | Boundary                                                |
| -------- | ------------------------------------------------------- |
| Taste    | taste side dominant                                     |
| Discover | line at two thirds; the card carries the same line      |
| Checking | the line sweeps across (real request duration only)     |
| Allow    | line opens a gate; permission side takes a calm tint    |
| Ask      | line becomes dashed                                     |
| Reject   | taste side retreats; permission side hatches solid      |
| Pause    | taste side desaturates; line dotted                     |
| Handoff  | gate open; permission side turns into a dashed hand-off |

The discovery card has the same line as the seam between image (taste) and controls (permission). The Checking screen enlarges it into a plane. All motion is removed under `prefers-reduced-motion`.

## Typography

Instrument Serif (display, discovery) and Inter 400/600/700 (system, authorization). Both are SIL OFL 1.1, self-hosted as latin woff2 subsets in `public/fonts/` with their licenses (`OFL-*.txt`); no network font request and no package dependency. `font-display: swap`.

## Image system: every candidate card renders a real image

1. A trustworthy exact-property image: no such provider exists; none was added. Tier empty.
2. The accepted Wikimedia Commons LOCATION_CONTEXT photo, unchanged adapter and validation, layered above the base image when it loads. It keeps its credit, license, cropping disclosure and the line "exact property not verified · presentation only, not Qloo evidence". When shown it replaces the local label.
3. An authored **Taste Image**: eight illustrated scenes (`public/taste/taste-0..7.svg`: lodge, harbour, arched courtyard, city dusk, terrace and pool, cabin in mist, coastal cliffs, tea room). Chosen deterministically from the candidate id, rendered as a real `<img>` with `alt="Illustrative taste image, not property photography"` and the visible label **"Illustrative taste image · not property photography"**. It never claims to show the place.

An abstract gradient or monogram is no longer the card image. Decision screens carry a small round crop of the same authored image.

Provenance stays truthful: the base image is a static presentation asset keyed by candidate id on the client only. Image/photo metadata is never sent to `/api/state/*`, never enters a Cultural Receipt or Qloo evidence (browser tests assert evaluation inputs contain no media fields; a unit test asserts the image module has no policy dependency).

## Screens

TASTE (editorial hero + five colour tiles), confirm, DISCOVER (image, name, location, one-line framing, three taste cues, Another one / Why this? / Looks good), CHECKING (boundary plane), ALLOW "This fits", ASK "One thing first", REJECT "Not this one", PAUSE "I don't know enough yet", HANDOFF (taste approved on one side; booking/purchase/payment needing separate execution authorization on the dashed other side, nothing executed). A repair proposal enters as a new card from the side, not appended.

## Tests

Adjusted only where the visual system required it: hero heading text, the fallback-image assertions (real image loaded, label, `taste-N.svg` source, no gradient/monogram), boundary/mode state assertions along the journey, loaded-font check, and a unit test that every `taste-N.svg` exists and every candidate id resolves to one. Existing state, provenance, no-execution, keyboard, reduced-motion, mobile-overflow and no-console-error assertions are unchanged.

Exact-head CI, Vercel and hosted acceptance are recorded in the PR handoff. No fresh-human claim.
