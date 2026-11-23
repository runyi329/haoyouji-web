import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import superjson from "superjson";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { compactT0JournalResponse } from "./t0-journal-response";

describe("T0 HTTP response compaction without financial projection changes", () => {
  it("only omits object undefined fields, preserving null, zeros, signs and order", () => {
    const source = { viewerMode: "member", viewerRelatedUserId: 20, omitted: undefined,
      entries: [{ id: "1", quantity: 0, price: -25, targetPrice: null, optionDirection: undefined }, { id: "2", quantity: 7, price: 1250 }],
      sharedIncomeTransfers: [{ amount: 0 }, { amount: -1 }, { amount: 20 }], profitShareSnapshots: [{ percentage: 0, matchedQuantity: 5 }],
      payoutCashFlows: [{ amount: 100, direction: "deposit", createdAt: "2026-11-23T12:00:00.000Z" }],
    };
    const result = compactT0JournalResponse(source);
    expect(result).not.toBe(source);
    expect(Object.hasOwn(result, "omitted")).toBe(false);
    expect(Object.hasOwn(result.entries[0], "optionDirection")).toBe(false);
    expect(result.entries[0].optionDirection).toBeUndefined();
    expect(Object.hasOwn(source.entries[0], "optionDirection")).toBe(true);
    expect(JSON.stringify(result)).toBe(JSON.stringify(source));
    expect(result.entries).toHaveLength(2);
    expect(result.sharedIncomeTransfers).toHaveLength(3);
  });

  it("does not alter date/buffer/numeric serializers or array undefined positions", () => {
    const date = new Date("2026-11-23T12:00:00Z");
    const buffer = Buffer.from("opaque");
    const source = { date, buffer, nan: NaN, infinity: Infinity, zero: -0, array: [undefined, 0, null, -25], missing: undefined };
    const result = compactT0JournalResponse(source);
    expect(result.date).toBe(date);
    expect(result.buffer).toBe(buffer);
    expect(result.array).toEqual(source.array);
    expect(Object.is(result.zero, -0)).toBe(true);
    // superjson本身不支持Node Buffer往返；helper仍必须保持其原引用。
    const { buffer: _unchangedBuffer, ...serializable } = result;
    const restored = superjson.deserialize<typeof serializable>(superjson.serialize(serializable));
    expect(restored.date.toISOString()).toBe(date.toISOString());
    expect(restored.array).toEqual(source.array);
    expect(Number.isNaN(restored.nan)).toBe(true);
    expect(restored.infinity).toBe(Infinity);
  });

  it("does not mutate frozen inputs or lose sharing/array holes", () => {
    const shared = Object.freeze({ id: "10", optional: undefined, amount: 0 });
    const array = new Array(3); array[1] = shared;
    const source = Object.freeze({ a: shared, b: shared, array: Object.freeze(array) });
    const result = compactT0JournalResponse(source);
    expect(result.a).toBe(result.b);
    expect(Object.hasOwn(result.a, "optional")).toBe(false);
    expect(Object.hasOwn(shared, "optional")).toBe(true);
    expect(result.array.length).toBe(3);
    expect(0 in result.array).toBe(false);
    expect(1 in result.array).toBe(true);
    expect(2 in result.array).toBe(false);
  });

  it("greatly reduces superjson paths while preserving every fixture record and number", () => {
    // Fixtures exist only in this pure test; no API, UI, database or persisted values.
    const optional = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`optional${index}`, undefined]));
    const source = { viewerMode: "admin", entries: Array.from({ length: 850 }, (_, index) => ({ ...optional, id: String(index+1), quantity: index % 3, price: index - 20, targetPrice: null, createdAt: "2026-11-23T12:00:00Z" })),
      sharedIncomeTransfers: Array.from({ length: 2809 }, (_, index) => ({ id: String(index), amount: index - 10, optional: undefined })) };
    const original = JSON.stringify(superjson.serialize(source));
    const compacted = JSON.stringify(superjson.serialize(compactT0JournalResponse(source)));
    const restored = superjson.deserialize<typeof source>(JSON.parse(compacted));
    expect(restored.entries).toHaveLength(850);
    expect(restored.sharedIncomeTransfers).toHaveLength(2809);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(source));
    expect(compacted.length).toBeLessThan(original.length * 0.6);
    expect(gzipSync(compacted).length).toBeLessThan(gzipSync(original).length);
  });

  it("applies only after the same three authorized t0GetJournal reads", () => {
    const text = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const tree = ts.createSourceFile("routers.ts", text, ts.ScriptTarget.Latest, true);
    let route: ts.PropertyAssignment | undefined;
    const visit = (node: ts.Node) => { if (ts.isPropertyAssignment(node) && node.name.getText(tree) === "t0GetJournal") route = node; ts.forEachChild(node, visit); };
    visit(tree);
    expect(route).toBeDefined();
    const body = route!.getText(tree);
    expect(body.match(/compactT0JournalResponse\(await journal\.getLedger52T0Journal\(/g)).toHaveLength(3);
    expect(body).toContain("viewerScopeUserId !== Number(ctx.user.id)");
    expect(body).toContain("managerScope.mode !== 'admin'");
    expect(body).toContain("relatedUserId: input.previewUserId");
    expect(body).toContain("relatedUserId: ctx.user.id");
    expect(body).toContain("getLedger52T0Journal(scope)");
    expect(body).not.toContain("fullRead:");
    expect(body).not.toContain("LIMIT");
  });
});
