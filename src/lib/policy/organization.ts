// Organization control foundation. A deployment operator (an organization that
// self-hosts TastePolicy for its members) can set a ceiling on the subjective
// action any agent may take without a human decision. It can only LOWER what a
// subject's own policy allows; it can never widen a subject's authority and it
// never touches hard rules. Per-organization membership, SSO/SCIM and an admin
// console are NOT implemented: the boundary is one organization per deployment,
// configured by the operator. Every decision records the ceiling it applied
// (ceilingSource ORGANIZATION), so the effect is auditable in the receipt.
import {
  SUBJECTIVE_ACTIONS,
  type OrganizationCeiling,
  type SubjectiveAction,
} from "./types";

export function organizationCeiling(
  env: Record<string, string | undefined>,
): OrganizationCeiling | null {
  const max = env.TASTEPOLICY_ORG_MAX_ACTION,
    id = env.TASTEPOLICY_ORG_ID;
  if (!max) return null;
  if (!SUBJECTIVE_ACTIONS.includes(max as SubjectiveAction))
    throw new Error("TASTEPOLICY_ORG_MAX_ACTION is not a subjective action");
  if (!id || !/^[a-zA-Z0-9_.-]{1,64}$/.test(id))
    throw new Error("TASTEPOLICY_ORG_ID is required with an org ceiling");
  return { organizationId: id, maxAction: max as SubjectiveAction };
}
