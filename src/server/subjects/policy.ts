import type { MemberAuthorization } from "@/lib/subjects/types";
// Subject decisions only. Deliberately no affinity input or provider dependency.
export function groupPolicy(members: readonly MemberAuthorization[]) {
  const ids = (decision: MemberAuthorization["decision"]) =>
    members
      .filter((m) => m.decision === decision)
      .map((m) => m.subjectId)
      .sort();
  const rejectingMembers = ids("REJECT"),
    unavailableMembers = ids("UNAVAILABLE"),
    askingMembers = ids("ASK"),
    allowingMembers = ids("ALLOW");
  return {
    aggregateDecision: rejectingMembers.length
      ? ("REJECT" as const)
      : unavailableMembers.length
        ? ("UNAVAILABLE" as const)
        : askingMembers.length
          ? ("ASK" as const)
          : ("ALLOW" as const),
    aggregateBasis: rejectingMembers.length
      ? ("MEMBER_REJECT" as const)
      : unavailableMembers.length
        ? ("MEMBER_EVIDENCE_UNAVAILABLE" as const)
        : askingMembers.length
          ? ("MEMBER_CLARIFICATION_REQUIRED" as const)
          : ("UNANIMOUS_ALLOW" as const),
    rejectingMembers,
    unavailableMembers,
    askingMembers,
    allowingMembers,
  };
}
