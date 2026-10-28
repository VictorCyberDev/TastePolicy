import type {
  PassportRecord,
  Grant,
  Credential,
  PlatformEvaluation,
} from "@/lib/platform/types";
export interface PlatformRepository {
  credentialAgent(
    user: string,
    credentialId: string,
  ): Promise<{ externalId: string; revoked: boolean } | null>;
  agentCredentials(user: string, externalId: string): Promise<Credential[]>;
  registeredAgent(
    user: string,
    id: string,
  ): Promise<{ externalId: string } | null>;
  revokeRegisteredAgent(user: string, id: string, at: string): Promise<void>;
  agentRevoked(user: string, externalId: string): Promise<boolean>;
  sessionActive(user: string, id: string, now: string): Promise<boolean>;
  user(id: string, lock?: boolean): Promise<boolean>;
  owned(user: string): Promise<PassportRecord | null>;
  passport(ref: string): Promise<PassportRecord | null>;
  insertPassport(p: PassportRecord): Promise<void>;
  updatePassport(p: PassportRecord): Promise<void>;
  version(ref: string, n: number): Promise<PassportRecord | null>;
  grant(g: Grant): Promise<void>;
  getGrant(id: string): Promise<Grant | null>;
  grants(user: string): Promise<Grant[]>;
  revokeGrant(g: Grant, at: string): Promise<void>;
  grantRevoked(id: string): Promise<boolean>;
  credential(c: Credential, hash: string): Promise<void>;
  findCredential(id: string, hash: string): Promise<Credential | null>;
  credentials(user: string): Promise<Credential[]>;
  revokeCredential(c: Credential, at: string): Promise<void>;
  // When the owner's grants and credentials were revoked (append-only events).
  revocations(user: string): Promise<{
    grants: Record<string, string>;
    credentials: Record<string, string>;
  }>;
  credentialRevoked(id: string): Promise<boolean>;
  op(
    user: string,
    operation: string,
    key: string,
  ): Promise<{ hash: string; result: unknown } | null>;
  saveOp(
    user: string,
    operation: string,
    key: string,
    hash: string,
    result: unknown,
  ): Promise<void>;
  rate(user: string, bucket: string, limit: number): Promise<boolean>;
  evaluation(e: PlatformEvaluation): Promise<void>;
  getEvaluation(ref: string): Promise<PlatformEvaluation | null>;
  versions(
    profile: string,
  ): Promise<import("@/lib/state/types").StateVersion[]>;
  exports(
    user: string,
    passport: PassportRecord,
    id: string,
    hash: string,
    manifest: unknown,
  ): Promise<void>;
  deletePassport(ref: string): Promise<void>;
  deleteUser(
    user: string,
    digest: string,
    now: string,
    expiry: string,
  ): Promise<void>;
}
