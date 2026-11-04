import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ clearLedgerViewAsState: vi.fn() }));
vi.mock("../client/src/lib/authIdentity", () => mocks);
import {
  isMibanPersonalQuery,
  prepareMibanPersonalQueries,
} from "../client/src/lib/miban-wallet-query-scope";

const key = (route: string[], input?: unknown) => [route, { type: "query", input }] as const;
const clients: QueryClient[] = [];
function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  clients.push(client);
  return client;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
});

describe("isMibanPersonalQuery", () => {
  it.each([
    [key(["auth", "me"]), true],
    [key(["auth", "getSwitchableUsers"]), true],
    [key(["recharge", "getUsdtBalanceSummary"]), true],
    [key(["miban", "getProfile"]), true],
    [key(["mibanOrder", "myOrders"]), true],
    [key(["mibanMember", "getMember"]), true],
    [key(["ledger", "afGetMyRechargeHistory"]), true],
    [key(["getCryptoPrices"]), false],
    [key(["public", "config"]), false],
    [key(["ledger", "getPublicSettings"]), false],
    [["auth", "me"], false],
    [["mibanOrder.myOrders"], false],
    [[null], false],
    [[[]], false],
    [[[123, "me"]], false],
  ])("matches only intended tRPC array path: %j => %s", (queryKey, expected) => {
    expect(isMibanPersonalQuery({ queryKey })).toBe(expected);
  });
});

describe("prepareMibanPersonalQueries (memory only, no DB/network)", () => {
  it("retains observed auth.me until fetching the new person, without loading/unmount transitions", async () => {
    const client = makeClient();
    const authKey = key(["auth", "me"]);
    const previous = { id: 52, avatar: "old-member" };
    const current = { id: 28, avatar: "self" };
    client.setQueryData(authKey, previous);
    const previousQuery = client.getQueryCache().find({ queryKey: authKey });
    const nextUser = deferred<typeof current>();
    const queryFn = vi.fn(() => nextUser.promise);
    const observer = new QueryObserver(client, { queryKey: authKey, queryFn, staleTime: Infinity });
    const statuses: string[] = [];
    const unsubscribe = observer.subscribe(result => statuses.push(result.status));
    const fetchCurrentUser = vi.fn(() => {
      expect(mocks.clearLedgerViewAsState).toHaveBeenCalledOnce();
      expect(client.getQueryData(authKey)).toEqual(previous);
      expect(client.getQueryCache().find({ queryKey: authKey })).toBe(previousQuery);
      expect(client.getQueryState(authKey)?.isInvalidated).toBe(true);
      expect(queryFn).not.toHaveBeenCalled(); // invalidation must not auto-refetch observers
      return client.fetchQuery({ queryKey: authKey, queryFn, staleTime: 0, retry: false });
    });
    try {
      const preparing = prepareMibanPersonalQueries(client, fetchCurrentUser);
      await vi.waitFor(() => expect(fetchCurrentUser).toHaveBeenCalledOnce());
      expect(client.getQueryData(authKey)).toEqual(previous);
      expect(observer.getCurrentResult().isLoading).toBe(false);
      nextUser.resolve(current);
      await expect(preparing).resolves.toBeUndefined();
      expect(client.getQueryData(authKey)).toEqual(current);
      expect(statuses).not.toContain("pending");
      expect(queryFn).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it("removes all recharge summaries/member data, miban-prefixed orders and switchable identities", async () => {
    const client = makeClient();
    const personalKeys = [
      key(["recharge", "getUsdtBalanceSummary"], { userId: 52 }),
      key(["recharge", "getCnyBalanceSummary"]),
      key(["recharge", "getMultiAssetBalances"]),
      key(["recharge", "getMemberBalance"], { memberId: 52 }),
      key(["miban", "getMember"]),
      key(["mibanOrder", "myOrders"]),
      key(["mibanOrder", "orderDetail"], { id: 1 }),
      key(["mibanMember", "profile"]),
      key(["ledger", "afGetMyRechargeHistory"]),
      key(["auth", "getSwitchableUsers"]),
    ];
    personalKeys.forEach(queryKey => client.setQueryData(queryKey, { owner: 52 }));
    await prepareMibanPersonalQueries(client, async () => {
      personalKeys.forEach(queryKey => expect(client.getQueryState(queryKey)).toBeUndefined());
    });
    personalKeys.forEach(queryKey => expect(client.getQueryState(queryKey)).toBeUndefined());
  });

  it("preserves unrelated public queries, crypto prices and non-array path keys", async () => {
    const client = makeClient();
    const publicKeys = [
      key(["getCryptoPrices"]),
      key(["public", "config"]),
      key(["ledger", "getPublicSettings"]),
      ["auth", "me"],
      ["mibanOrder.myOrders"],
    ];
    publicKeys.forEach(queryKey => client.setQueryData(queryKey, { public: true }));
    await prepareMibanPersonalQueries(client, async () => undefined);
    publicKeys.forEach(queryKey => {
      expect(client.getQueryData(queryKey)).toEqual({ public: true });
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
    });
  });

  it("clears viewing state before cancellation and cancels old requests without waiting for network", async () => {
    const client = makeClient();
    const memberKey = key(["recharge", "getMemberBalance"], { userId: 52 });
    const oldNetwork = deferred<{ balance: number }>();
    let signal!: AbortSignal;
    const oldFetch = client.fetchQuery({
      queryKey: memberKey,
      queryFn: context => {
        signal = context.signal;
        return oldNetwork.promise; // deliberately does not settle on abort
      },
    }).catch(error => error);
    const cancelSpy = vi.spyOn(client, "cancelQueries");
    await prepareMibanPersonalQueries(client, async () => {
      expect(signal.aborted).toBe(true);
      expect(client.getQueryState(memberKey)).toBeUndefined();
    });
    expect(mocks.clearLedgerViewAsState.mock.invocationCallOrder[0]).toBeLessThan(
      cancelSpy.mock.invocationCallOrder[0],
    );
    expect(signal.aborted).toBe(true);
    client.setQueryData(memberKey, { balance: 28 });
    oldNetwork.resolve({ balance: 999 });
    await oldFetch;
    await Promise.resolve();
    expect(client.getQueryData(memberKey)).toEqual({ balance: 28 });
    cancelSpy.mockRestore();
  }, 1000);

  it("does not cancel an unrelated public request", async () => {
    const client = makeClient();
    const publicKey = key(["getCryptoPrices"]);
    const network = deferred<{ ETH: number }>();
    let signal!: AbortSignal;
    const pending = client.fetchQuery({ queryKey: publicKey, queryFn: context => {
      signal = context.signal;
      return network.promise;
    } });
    await prepareMibanPersonalQueries(client, async () => undefined);
    expect(signal.aborted).toBe(false);
    network.resolve({ ETH: 2000 });
    await pending;
    expect(client.getQueryData(publicKey)).toEqual({ ETH: 2000 });
  });

  it("propagates identity-fetch failure rather than reporting successful preparation", async () => {
    const client = makeClient();
    const authKey = key(["auth", "me"]);
    const rechargeKey = key(["recharge", "getUsdtBalanceSummary"]);
    client.setQueryData(authKey, { id: 52 });
    client.setQueryData(rechargeKey, { balance: 999 });
    const failure = new Error("cannot refresh current identity");
    const fetchCurrentUser = vi.fn().mockRejectedValue(failure);
    await expect(prepareMibanPersonalQueries(client, fetchCurrentUser)).rejects.toBe(failure);
    expect(fetchCurrentUser).toHaveBeenCalledOnce();
    expect(client.getQueryData(authKey)).toEqual({ id: 52 });
    expect(client.getQueryState(authKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(rechargeKey)).toBeUndefined();
  });
});
