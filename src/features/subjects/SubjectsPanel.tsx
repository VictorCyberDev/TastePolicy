"use client";
import { useRef, useState } from "react";
import type { StateVersion, StateEvaluation } from "@/lib/state/types";
import type {
  QlooEntity,
  EntityType,
  EntityResolution,
  ProviderResult,
  CulturalReceipt,
} from "@/types/domain";
import { ENTITY_TYPES } from "@/types/domain";
import type {
  TasteSubject,
  PermissionAttestation,
  ProxyAuthorization,
  TasteGroup,
  GroupVersion,
  GroupAuthorization,
} from "@/lib/subjects/types";
import "./SubjectsPanel.css";
type SubjectView = {
  subject: TasteSubject;
  deleted: boolean;
  permission: PermissionAttestation | null;
  permissionActive: boolean;
  state: StateVersion | null;
};
type GroupView = { group: TasteGroup; version: GroupVersion; closed: boolean };
const messages: Record<string, string> = {
  PERMISSION_INACTIVE:
    "Delegated permission expired, was revoked, or the model was deleted. New authorization is blocked.",
  PERMISSION_SCOPE_REQUIRED:
    "This proxy does not have the required permission scope.",
  GROUP_MEMBER_STATE_STALE:
    "A member state changed. Evaluate that subject again before aggregating.",
  GROUP_VERSION_CONFLICT:
    "Membership changed. Refresh and explicitly select the new version.",
  GROUP_MEMBER_INPUT_MISMATCH:
    "Every subject must be evaluated for the same candidate and action context.",
  GROUP_EVALUATION_INCOMPLETE:
    "Select one completed evaluation for every member. Missing execution is not UNAVAILABLE evidence.",
  persistence_not_configured:
    "M5 requires server-side PostgreSQL persistence; no substitute is used.",
  PROXY_MODEL_INSUFFICIENT:
    "Five distinct, reviewed anchors across multiple cultural domains are required.",
  NOT_FOUND: "This subject or group is unavailable in your profile.",
};
export default function SubjectsPanel({
  state,
  evaluations,
  receipt,
}: {
  state: StateVersion;
  evaluations: StateEvaluation[];
  receipt: CulturalReceipt | null;
}) {
  const [subjects, setSubjects] = useState<SubjectView[]>([]),
    [groups, setGroups] = useState<GroupView[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(
      "No automatic provider requests. Inspect subjects to begin.",
    ),
    [displayLabel, setDisplayLabel] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [attested, setAttested] = useState(false),
    [groupScope, setGroupScope] = useState(false),
    [selectedSubject, setSelectedSubject] = useState(""),
    [context, setContext] = useState("demo"),
    [proxyResults, setProxyResults] = useState<ProxyAuthorization[]>([]),
    [groupLabel, setGroupLabel] = useState(""),
    [memberIds, setMemberIds] = useState<string[]>([]),
    [selectedGroup, setSelectedGroup] = useState(""),
    [refs, setRefs] = useState<Record<string, string>>({}),
    [groupResult, setGroupResult] = useState<GroupAuthorization | null>(null),
    [recorded, setRecorded] = useState(false),
    [slots, setSlots] = useState<
      {
        query: string;
        type: EntityType;
        matches: QlooEntity[];
        selected: string;
      }[]
    >(
      Array.from({ length: 5 }, () => ({
        query: "",
        type: "artist",
        matches: [],
        selected: "",
      })),
    );
  const keys = useRef(new Map<string, string>());
  async function call<T>(
    kind: string,
    op: string,
    payload: Record<string, unknown> = {},
    mutating = false,
  ): Promise<T> {
    const fingerprint = kind + op + JSON.stringify(payload);
    if (mutating && !keys.current.has(fingerprint))
      keys.current.set(fingerprint, crypto.randomUUID());
    const response = await fetch(`/api/state/subjects/${kind}/${op}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        ...(mutating ? { idempotencyKey: keys.current.get(fingerprint) } : {}),
      }),
    });
    const result = await response.json();
    if (result.status !== "available")
      throw Error(
        messages[result.code ?? result.reason] ??
          "Operation unavailable. No cultural authority was fabricated.",
      );
    return result.data;
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    const [s, g] = await Promise.all([
      call<SubjectView[]>("proxy", "inspect"),
      call<GroupView[]>("group", "inspect"),
    ]);
    setSubjects(s);
    setGroups(g);
    setNotice(
      "Subjects remain separate. Historical evidence does not authorize new work after revocation.",
    );
  }
  const proxy = subjects.find((s) => s.subject.subjectId === selectedSubject),
    group = groups.find((g) => g.group.groupId === selectedGroup),
    candidate = receipt?.candidate ?? evaluations.at(-1)?.action.candidate;
  const options = [
    ...evaluations.map((e) => ({
      subjectId: state.profileId,
      id: e.evaluationId,
      decision: e.decision.outcome,
      candidate: e.action.candidate.name,
      context: e.context.key,
      version: e.stateVersion,
    })),
    ...proxyResults.map((p) => ({
      subjectId: p.subjectId,
      id: p.authorizationId,
      decision: p.baseEvaluation.decision.outcome,
      candidate: p.baseEvaluation.action.candidate.name,
      context: p.baseEvaluation.context.key,
      version: p.stateVersion,
    })),
  ];
  function changeSlot(i: number, patch: Partial<(typeof slots)[number]>) {
    setSlots((old) => old.map((s, j) => (i === j ? { ...s, ...patch } : s)));
    setReviewed(false);
  }
  return (
    <section className="subjects-panel" aria-labelledby="subjects-title">
      <header>
        <p className="eyebrow">
          M5 · Delegated subjects / explicit group policy
        </p>
        <h2 id="subjects-title">Whose taste?</h2>
        <p>
          SELF and PROXY have independent immutable Taste States. A group
          references subjects; it has no combined taste.
        </p>
      </header>
      <p className="permission-disclaimer">
        Permission is attested by the current user and is not independently
        verified.
      </p>
      <button disabled={busy} onClick={() => run(inspect)}>
        Inspect subjects and groups
      </button>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <fieldset disabled={busy}>
        <legend>Create a delegated model</legend>
        <label>
          Pseudonymous display label
          <input
            maxLength={60}
            value={displayLabel}
            onChange={(e) => setDisplayLabel(e.target.value)}
            autoComplete="off"
          />
        </label>
        <p>
          Supply five explicit anchors. Nothing is copied from your SELF
          profile. Model input provenance: DELEGATE_ATTESTED, not
          subject-confirmed.
        </p>
        {slots.map((slot, i) => (
          <fieldset key={i}>
            <legend>Proxy anchor {i + 1}</legend>
            <label>
              Cultural concept
              <input
                maxLength={120}
                value={slot.query}
                onChange={(e) =>
                  changeSlot(i, {
                    query: e.target.value,
                    matches: [],
                    selected: "",
                  })
                }
              />
            </label>
            <label>
              Domain
              <select
                value={slot.type}
                onChange={(e) =>
                  changeSlot(i, {
                    type: e.target.value as EntityType,
                    matches: [],
                    selected: "",
                  })
                }
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <button
              disabled={!slot.query.trim()}
              onClick={() =>
                run(async () => {
                  const r = await call<ProviderResult<EntityResolution>>(
                    "proxy",
                    "resolve",
                    { query: slot.query, expectedType: slot.type },
                  );
                  if (r.status !== "available")
                    throw Error(
                      "Cultural identity resolution unavailable. No identity was selected.",
                    );
                  changeSlot(i, { matches: r.data.matches, selected: "" });
                  setNotice(
                    "Review the returned identity; ambiguous matches are never automatically selected.",
                  );
                })
              }
            >
              Resolve proxy anchor {i + 1}
            </button>
            <label>
              Reviewed identity
              <select
                value={slot.selected}
                onChange={(e) => changeSlot(i, { selected: e.target.value })}
              >
                <option value="">Choose identity explicitly</option>
                {slot.matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.type}
                    {m.releaseYear ? ` · ${m.releaseYear}` : ""} · {m.id}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed all five distinct identities and supplied them as model
          inputs.
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
          />
          I attest permission to manage this delegated model and evaluate its
          taste.
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={groupScope}
            onChange={(e) => setGroupScope(e.target.checked)}
          />
          I also attest permission for GROUP_EVALUATION.
        </label>
        <p>
          Required scopes: MODEL_MANAGEMENT + TASTE_EVALUATION. Permission
          expires no later than this temporary owner profile.
        </p>
        <button
          disabled={
            !displayLabel.trim() ||
            !reviewed ||
            !attested ||
            slots.some((s) => !s.selected)
          }
          onClick={() =>
            run(async () => {
              await call(
                "proxy",
                "create",
                {
                  displayLabel,
                  signalIds: slots.map((s) => s.selected),
                  identityReviewed: true,
                  permissionAttested: true,
                  scopes: [
                    "MODEL_MANAGEMENT",
                    "TASTE_EVALUATION",
                    ...(groupScope ? ["GROUP_EVALUATION"] : []),
                  ],
                },
                true,
              );
              await inspect();
              setNotice(
                "Independent proxy created. SELF Taste State was not changed.",
              );
            })
          }
        >
          Create proxy subject
        </button>
      </fieldset>
      {subjects.length > 0 && (
        <fieldset disabled={busy}>
          <legend>Independent subject evaluation</legend>
          <label>
            Subject
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
            >
              <option value="">Select proxy</option>
              {subjects
                .filter((s) => s.subject.subjectKind === "PROXY" && !s.deleted)
                .map((s) => (
                  <option key={s.subject.subjectId} value={s.subject.subjectId}>
                    Proxy: {s.subject.displayLabel}
                  </option>
                ))}
            </select>
          </label>
          {proxy && (
            <article>
              <h3>Proxy: {proxy.subject.displayLabel}</h3>
              <p>
                This is a delegated model, not the owner&apos;s Taste State.
              </p>
              <p>
                Permission: USER_ATTESTED_PERMISSION ·{" "}
                {proxy.permissionActive ? "Active" : "Inactive"}
              </p>
              <p>
                Scopes: {proxy.permission?.scopes.join(", ")} · Expires:{" "}
                {proxy.permission?.expiresAt}
              </p>
              <p>
                State version: {proxy.state?.stateVersion} · DELEGATE_ATTESTED
                anchors
              </p>
              <ul>
                {proxy.state?.entries
                  .filter((e) => e.kind === "EXPLICIT_LIKE")
                  .map((e) => (
                    <li key={e.signalId}>
                      {e.entity?.name} · {e.entity?.type}
                    </li>
                  ))}
              </ul>
              <p>
                Proposed action: SELECT_ENTITY ·{" "}
                {candidate?.name ??
                  "Choose and evaluate a candidate in the existing demo first."}
              </p>
              <label>
                Shared action context
                <input
                  maxLength={64}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </label>
              <button
                disabled={!proxy.permissionActive || !candidate || !proxy.state}
                onClick={() =>
                  run(async () => {
                    const p = await call<ProxyAuthorization>(
                      "proxy",
                      "evaluate",
                      {
                        subjectId: proxy.subject.subjectId,
                        proposal: {
                          agentId: "Proxy-Agent",
                          candidate,
                          context: { key: context, domain: candidate!.type },
                          expectedStateVersion: proxy.state!.stateVersion,
                        },
                      },
                      true,
                    );
                    setProxyResults((old) => [
                      ...old.filter(
                        (x) => x.authorizationId !== p.authorizationId,
                      ),
                      p,
                    ]);
                    setNotice(
                      `Proxy cultural policy: ${p.baseEvaluation.decision.outcome}. No execution authority granted.`,
                    );
                  })
                }
              >
                Evaluate proxy independently
              </button>
              <button
                onClick={() =>
                  run(async () => {
                    await call(
                      "proxy",
                      "revoke",
                      { subjectId: proxy.subject.subjectId },
                      true,
                    );
                    await inspect();
                  })
                }
              >
                Revoke delegated permission
              </button>
              <button
                onClick={() =>
                  run(async () => {
                    await call(
                      "proxy",
                      "delete",
                      { subjectId: proxy.subject.subjectId },
                      true,
                    );
                    await inspect();
                  })
                }
              >
                Delete proxy model access
              </button>
              <p>
                Deletion tombstones model access; private historical evidence is
                retained only until owner expiry/purge.
              </p>
            </article>
          )}
          {proxyResults.map((p) => (
            <article key={p.authorizationId}>
              <h3>
                Proxy cultural policy: {p.baseEvaluation.decision.outcome}
              </h3>
              <p>
                Candidate: {p.baseEvaluation.action.candidate.name} · State{" "}
                {p.stateVersion} · {p.baseEvaluation.decision.basis}
              </p>
              <p>{p.authorityBoundary}</p>
              <p>
                ASK remains unresolved; the delegate cannot answer as the
                subject.
              </p>
              <details>
                <summary>Proxy wrapper and base Cultural Receipt</summary>
                <pre>{JSON.stringify(p, null, 2)}</pre>
              </details>
              <button
                onClick={() =>
                  run(async () => {
                    const r = await call<{ permissionActiveNow: boolean }>(
                      "proxy",
                      "replay",
                      { authorizationId: p.authorizationId },
                    );
                    setNotice(
                      `Recorded proxy replay. Permission active now: ${r.permissionActiveNow}. Zero fresh Qloo calls.`,
                    );
                  })
                }
              >
                Replay proxy receipt
              </button>
            </article>
          ))}
        </fieldset>
      )}
      <fieldset disabled={busy}>
        <legend>Group authorization · 2–5 unique subjects</legend>
        <p>
          <strong>UNANIMOUS — EVERY MEMBER MUST ALLOW.</strong> Equal decision
          rights. A single REJECT cannot be outvoted. No affinity averaging or
          compatibility score.
        </p>
        <label>
          Group label
          <input
            maxLength={60}
            value={groupLabel}
            onChange={(e) => setGroupLabel(e.target.value)}
          />
        </label>
        {subjects
          .filter((s) => !s.deleted)
          .map((s) => (
            <label className="check" key={s.subject.subjectId}>
              <input
                type="checkbox"
                checked={memberIds.includes(s.subject.subjectId)}
                onChange={(e) =>
                  setMemberIds((old) =>
                    e.target.checked
                      ? [...old, s.subject.subjectId]
                      : old.filter((i) => i !== s.subject.subjectId),
                  )
                }
              />
              {s.subject.subjectKind === "SELF"
                ? "You · SELF"
                : `Proxy: ${s.subject.displayLabel}`}
            </label>
          ))}
        <button
          disabled={
            !groupLabel.trim() || memberIds.length < 2 || memberIds.length > 5
          }
          onClick={() =>
            run(async () => {
              const g = await call<GroupView>(
                "group",
                "create",
                { displayLabel: groupLabel, memberSubjectIds: memberIds },
                true,
              );
              await inspect();
              setSelectedGroup(g.group.groupId);
            })
          }
        >
          Create versioned group
        </button>
        <label>
          Existing group
          <select
            value={selectedGroup}
            onChange={(e) => {
              setSelectedGroup(e.target.value);
              setRefs({});
            }}
          >
            <option value="">Select group</option>
            {groups
              .filter((g) => !g.closed)
              .map((g) => (
                <option key={g.group.groupId} value={g.group.groupId}>
                  {g.group.displayLabel} · v{g.group.currentVersion}
                </option>
              ))}
          </select>
        </label>
        {group && (
          <>
            <p>
              Policy: {group.version.policyId} · Version{" "}
              {group.version.groupVersion}
            </p>
            <button
              disabled={memberIds.length < 2 || memberIds.length > 5}
              onClick={() =>
                run(async () => {
                  await call(
                    "group",
                    "update",
                    {
                      groupId: group.group.groupId,
                      expectedGroupVersion: group.version.groupVersion,
                      memberSubjectIds: memberIds,
                    },
                    true,
                  );
                  await inspect();
                })
              }
            >
              Create new membership version from selection
            </button>
            {group.version.memberSubjectIds.map((sid) => (
              <label key={sid}>
                Completed result ·{" "}
                {subjects.find((s) => s.subject.subjectId === sid)?.subject
                  .displayLabel ?? "Member"}
                <select
                  value={refs[sid] ?? ""}
                  onChange={(e) =>
                    setRefs((old) => ({ ...old, [sid]: e.target.value }))
                  }
                >
                  <option value="">Select one independent evaluation</option>
                  {options
                    .filter((o) => o.subjectId === sid)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.candidate} · {o.context} · v{o.version} ·{" "}
                        {o.decision}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <p>
              SELF evaluations come from the existing SELF authorization
              surface. Evaluate every subject separately for the same
              candidate/context and current state.
            </p>
            <button
              disabled={group.version.memberSubjectIds.some(
                (sid) => !refs[sid],
              )}
              onClick={() =>
                run(async () => {
                  const result = await call<GroupAuthorization>(
                    "group",
                    "authorize",
                    {
                      groupId: group.group.groupId,
                      expectedGroupVersion: group.version.groupVersion,
                      memberAuthorizations: group.version.memberSubjectIds.map(
                        (subjectId) => ({
                          subjectId,
                          authorizationId: refs[subjectId],
                        }),
                      ),
                    },
                    true,
                  );
                  setGroupResult(result);
                  setRecorded(false);
                  setNotice(
                    "Group policy evaluated completed member decisions. Zero Qloo calls.",
                  );
                })
              }
            >
              Aggregate completed decisions · no Qloo calls
            </button>
          </>
        )}
      </fieldset>
      {groupResult && (
        <article aria-label="Group authorization result">
          <p>
            {recorded
              ? "RECORDED HISTORICAL EVIDENCE"
              : "COMPLETED GROUP AUTHORIZATION"}
          </p>
          <h3>Group cultural policy: {groupResult.aggregateDecision}</h3>
          <p>{groupResult.aggregateBasis.replaceAll("_", " ")}</p>
          <table>
            <caption>Independent member decisions — equal rights</caption>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Decision</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {groupResult.memberResults.map((m) => (
                <tr key={m.subjectId}>
                  <td>
                    {subjects.find((s) => s.subject.subjectId === m.subjectId)
                      ?.subject.displayLabel ?? m.subjectKind}
                  </td>
                  <td>{m.decision}</td>
                  <td>v{m.stateVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {groupResult.aggregateDecision === "REJECT"
              ? "One or more members rejected; unanimous policy does not override a minority veto."
              : groupResult.aggregateDecision === "UNAVAILABLE"
                ? "Required member evidence is unavailable. This does not mean the member dislikes the candidate."
                : groupResult.aggregateDecision === "ASK"
                  ? "At least one member requires clarification. No rejection or missing evidence was averaged away."
                  : "Every modeled subject independently passed cultural authorization."}
          </p>
          <p>{groupResult.authorityBoundary}</p>
          <details>
            <summary>Group Cultural Authorization envelope</summary>
            <pre>{JSON.stringify(groupResult, null, 2)}</pre>
          </details>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await call<{ envelope: GroupAuthorization }>(
                  "group",
                  "replay",
                  { authorizationId: groupResult.authorizationId },
                );
                setGroupResult(r.envelope);
                setRecorded(true);
                setNotice(
                  "Historical group replay uses captured member evidence. Zero Qloo calls.",
                );
              })
            }
          >
            Replay group receipt
          </button>
        </article>
      )}
    </section>
  );
}
