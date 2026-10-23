import { readFile } from "node:fs/promises";
import { join } from "node:path";
// SYNTHETIC TEST DATA. Actual accepted services and PostgreSQL SQL, never production fallback.
import {
  interactiveDatabase,
  provider,
  NOW,
  reqId,
  ALT,
} from "./interactive-fixtures";
import { TasteStateService } from "@/server/state/service";
import { InteractiveService } from "@/server/interactive/service";
import type { ConsumerCall } from "@/features/arena/useConsumerAuthorization";
import { entities } from "./qloo-fixtures";
import type { QlooEntity } from "@/types/domain";
export const consumerCandidate: QlooEntity = {
  ...entities[5],
  type: "place",
  name: "SYNTHETIC TEST DATA original place",
};
export const consumerAlternative: QlooEntity = {
  ...ALT,
  type: "place",
  name: "SYNTHETIC TEST DATA alternative place",
};
export async function consumerHarness() {
  const d = await interactiveDatabase(undefined, false);
  for (const file of [
    "0001_taste_state.sql",
    "0002_interactive_authorization.sql",
  ])
    await d.db.exec(
      await readFile(join(process.cwd(), "migrations", file), "utf8"),
    );
  const state = new TasteStateService(d.store, () => NOW);
  const interactive = new InteractiveService(d.store, () => NOW);
  let token = "";
  let failing = false;
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const p = provider();
  const remap = (e: QlooEntity) =>
    e.id === entities[5].id
      ? consumerCandidate
      : e.id === ALT.id
        ? consumerAlternative
        : e;
  const q = {
    ...p.q,
    async entities(ids: string[]) {
      const result = await p.q.entities(ids);
      return result.status === "available"
        ? { ...result, data: result.data.map(remap) }
        : result;
    },
    async infer(input: Parameters<typeof p.q.infer>[0]) {
      if (failing)
        return { status: "unavailable" as const, reason: "timeout" as const };
      const result = await p.q.infer(input);
      return result.status === "available"
        ? {
            ...result,
            data: {
              ...result.data,
              candidates: result.data.candidates.map((c) => ({
                ...c,
                entity: remap(c.entity),
              })),
            },
          }
        : result;
    },
  };
  const call: ConsumerCall = async <T>(path: string, raw: unknown) => {
    const body = raw as Record<string, unknown>;
    calls.push({ path, body });
    let result: unknown;
    if (path === "/api/state/session") {
      if (!token) token = (await state.createSession()).token;
      result = undefined;
    } else if (path === "/api/state/read") result = await state.read(token);
    else if (path === "/api/state/mutate")
      result = await state.mutate(token, body, reqId);
    else if (path === "/api/state/evaluate")
      result = await state.evaluate(token, body, () => q, reqId);
    else if (path.endsWith("/plan"))
      result = await interactive.plan(token, body);
    else if (path.endsWith("/answer"))
      result = await interactive.answer(token, body, reqId);
    else if (path.endsWith("/repair"))
      result = await interactive.repair(token, body, () => q, reqId);
    else throw Error("Unexpected synthetic request");
    return result as T;
  };
  return {
    ...d,
    call,
    calls,
    providerCalls: p.calls,
    read: () => state.read(token),
    fail: () => {
      failing = true;
    },
    stateService: state,
    token: () => token,
  };
}
