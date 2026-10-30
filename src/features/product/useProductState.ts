"use client";
import { useCallback, useEffect, useState } from "react";
import { resolveProductState, type ProductState } from "@/lib/product/state";

export function useProductState() {
  const [state, setState] = useState<ProductState>({ kind: "LOADING" });
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/account/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await r.json().catch(() => ({}));
      setState(resolveProductState(r.ok, body));
    } catch {
      setState({ kind: "UNAVAILABLE", code: "NETWORK" });
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  return { state, reload: load };
}
