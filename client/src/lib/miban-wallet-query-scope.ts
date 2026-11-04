import type { QueryClient } from "@tanstack/react-query";
import { clearLedgerViewAsState } from "./authIdentity";

type QueryWithKey = { queryKey: readonly unknown[] };

/** Only match tRPC's array-path keys, never unrelated/public query keys. */
export function isMibanPersonalQuery({ queryKey }: QueryWithKey): boolean {
  const route = queryKey[0];
  if (!Array.isArray(route) || typeof route[0] !== "string") return false;
  return (
    route[0] === "auth" ||
    route[0] === "recharge" ||
    route[0].startsWith("miban") ||
    (route[0] === "ledger" && route[1] === "afGetMyRechargeHistory")
  );
}

function isAuthMeQuery({ queryKey }: QueryWithKey): boolean {
  const route = queryKey[0];
  return Array.isArray(route) && route.length === 2 && route[0] === "auth" && route[1] === "me";
}

/**
 * Cancel old member requests before removing their data. Keep auth.me's data and
 * observers intact: clearing it would put App into loading and unmount this gate.
 * The caller must force auth.me.fetch(undefined, { staleTime: 0, retry: false }).
 * Rejections deliberately propagate so the entry gate cannot render old identity.
 */
export async function prepareMibanPersonalQueries(
  queryClient: QueryClient,
  fetchCurrentUser: () => Promise<unknown>,
): Promise<void> {
  clearLedgerViewAsState();
  await queryClient.cancelQueries({ predicate: isMibanPersonalQuery });
  queryClient.removeQueries({
    predicate: query => isMibanPersonalQuery(query) && !isAuthMeQuery(query),
  });
  await queryClient.invalidateQueries({
    predicate: isAuthMeQuery,
    refetchType: "none",
  });
  await fetchCurrentUser();
}
