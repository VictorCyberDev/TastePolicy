import "server-only";
import type { PoolClient } from "pg";

export interface OAuthClient {
  clientId: string;
  source: "CIMD" | "DCR";
  clientName: string;
  redirectUris: string[];
  fetchedAt: string;
}
export interface OAuthCode {
  codeHash: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource: string;
  expiresAt: string;
  usedAt: string | null;
  familyId: string | null;
}
export interface OAuthFamily {
  familyId: string;
  userId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  resource: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}
export interface OAuthRepository {
  client(id: string): Promise<OAuthClient | null>;
  saveClient(c: OAuthClient): Promise<void>;
  insertCode(c: Omit<OAuthCode, "usedAt" | "familyId">): Promise<void>;
  // Atomic: returns the row only to the first redeemer.
  redeemCode(hash: string, at: string): Promise<OAuthCode | null>;
  codeByHash(hash: string): Promise<OAuthCode | null>;
  attachFamily(hash: string, familyId: string): Promise<void>;
  insertFamily(f: OAuthFamily): Promise<void>;
  family(id: string): Promise<OAuthFamily | null>;
  families(user: string): Promise<OAuthFamily[]>;
  revokeFamily(id: string, at: string): Promise<string[]>;
  touchFamily(id: string, at: string): Promise<void>;
  insertRefresh(
    hash: string,
    familyId: string,
    expiresAt: string,
  ): Promise<void>;
  // Atomic: marks used and returns the family only to the first presenter.
  useRefresh(
    hash: string,
    at: string,
  ): Promise<
    | { state: "OK"; familyId: string }
    | { state: "REUSED"; familyId: string }
    | { state: "EXPIRED" | "UNKNOWN" }
  >;
}
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const family = (r: Record<string, unknown>): OAuthFamily => ({
  familyId: r.family_id as string,
  userId: r.user_id as string,
  clientId: r.client_id as string,
  clientName: r.client_name as string,
  scopes: r.scopes as string[],
  resource: r.resource as string,
  createdAt: iso(r.created_at)!,
  revokedAt: iso(r.revoked_at),
  lastUsedAt: iso(r.last_used_at),
});
const code = (r: Record<string, unknown>): OAuthCode => ({
  codeHash: r.code_hash as string,
  userId: r.user_id as string,
  clientId: r.client_id as string,
  redirectUri: r.redirect_uri as string,
  codeChallenge: r.code_challenge as string,
  scopes: r.scopes as string[],
  resource: r.resource as string,
  expiresAt: iso(r.expires_at)!,
  usedAt: iso(r.used_at),
  familyId: (r.family_id as string) ?? null,
});
export function oauthRepository(c: PoolClient): OAuthRepository {
  return {
    async client(id) {
      const q = await c.query(
        "SELECT * FROM tastepolicy.oauth_clients WHERE client_id=$1",
        [id],
      );
      const r = q.rows[0];
      return r
        ? {
            clientId: r.client_id,
            source: r.source,
            clientName: r.client_name,
            redirectUris: r.redirect_uris,
            fetchedAt: iso(r.fetched_at)!,
          }
        : null;
    },
    async saveClient(k) {
      await c.query(
        "INSERT INTO tastepolicy.oauth_clients(client_id,source,client_name,redirect_uris,fetched_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(client_id) DO UPDATE SET client_name=EXCLUDED.client_name,redirect_uris=EXCLUDED.redirect_uris,fetched_at=EXCLUDED.fetched_at WHERE tastepolicy.oauth_clients.source='CIMD'",
        [k.clientId, k.source, k.clientName, k.redirectUris, k.fetchedAt],
      );
    },
    async insertCode(k) {
      await c.query(
        "INSERT INTO tastepolicy.oauth_codes(code_hash,user_id,client_id,redirect_uri,code_challenge,scopes,resource,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          k.codeHash,
          k.userId,
          k.clientId,
          k.redirectUri,
          k.codeChallenge,
          k.scopes,
          k.resource,
          k.expiresAt,
        ],
      );
    },
    async redeemCode(hash, at) {
      const q = await c.query(
        "UPDATE tastepolicy.oauth_codes SET used_at=$2 WHERE code_hash=$1 AND used_at IS NULL RETURNING *",
        [hash, at],
      );
      return q.rows[0] ? code(q.rows[0]) : null;
    },
    async codeByHash(hash) {
      const q = await c.query(
        "SELECT * FROM tastepolicy.oauth_codes WHERE code_hash=$1",
        [hash],
      );
      return q.rows[0] ? code(q.rows[0]) : null;
    },
    async attachFamily(hash, familyId) {
      await c.query(
        "UPDATE tastepolicy.oauth_codes SET family_id=$2 WHERE code_hash=$1",
        [hash, familyId],
      );
    },
    async insertFamily(f) {
      await c.query(
        "INSERT INTO tastepolicy.oauth_families(family_id,user_id,client_id,client_name,scopes,resource,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          f.familyId,
          f.userId,
          f.clientId,
          f.clientName,
          f.scopes,
          f.resource,
          f.createdAt,
        ],
      );
    },
    async family(id) {
      const q = await c.query(
        "SELECT * FROM tastepolicy.oauth_families WHERE family_id=$1",
        [id],
      );
      return q.rows[0] ? family(q.rows[0]) : null;
    },
    async families(user) {
      const q = await c.query(
        "SELECT * FROM tastepolicy.oauth_families WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [user],
      );
      return q.rows.map(family);
    },
    // Marks the family revoked and ends every access credential it issued.
    async revokeFamily(id, at) {
      await c.query(
        "UPDATE tastepolicy.oauth_families SET revoked_at=COALESCE(revoked_at,$2) WHERE family_id=$1",
        [id, at],
      );
      const q = await c.query(
        "SELECT credential_id,user_id FROM tastepolicy.developer_credentials WHERE data->'oauth'->>'familyId'=$1",
        [id],
      );
      for (const r of q.rows)
        await c.query(
          "INSERT INTO tastepolicy.developer_credential_events VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [r.user_id, r.credential_id, { kind: "CREDENTIAL_REVOKED", at }],
        );
      return q.rows.map((r) => r.credential_id as string);
    },
    async touchFamily(id, at) {
      await c.query(
        "UPDATE tastepolicy.oauth_families SET last_used_at=$2 WHERE family_id=$1",
        [id, at],
      );
    },
    async insertRefresh(hash, familyId, expiresAt) {
      await c.query(
        "INSERT INTO tastepolicy.oauth_refresh(token_hash,family_id,expires_at) VALUES($1,$2,$3)",
        [hash, familyId, expiresAt],
      );
    },
    async useRefresh(hash, at) {
      const q = await c.query(
        "UPDATE tastepolicy.oauth_refresh SET used_at=$2 WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2 RETURNING family_id",
        [hash, at],
      );
      if (q.rows[0]) return { state: "OK", familyId: q.rows[0].family_id };
      const p = await c.query(
        "SELECT family_id,used_at,expires_at FROM tastepolicy.oauth_refresh WHERE token_hash=$1",
        [hash],
      );
      const r = p.rows[0];
      if (!r) return { state: "UNKNOWN" };
      return r.used_at
        ? { state: "REUSED", familyId: r.family_id }
        : { state: "EXPIRED" };
    },
  };
}
