import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { serialize, deserialize } from "node:v8";
import { spawn } from "node:child_process";
import {
  openStockMACheckpointStore,
  type StockMACheckpointStore,
  type StockMAStoredGeneration,
} from "./stock-ma-checkpoint-store";

// No DB, HTTP, runtime, connection, environment changes, production, or checkout
// fixtures. All writes (including child crash fixtures) are under OS tmpdir.
let temporary: string;
let root: string;
const identity = "opaque-source-sha256";
const algorithm = "ma-v1";
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const light = () =>
  serialize({
    stocks: ["opaque-reference"],
    packed: new Uint8Array([1, 0, 3]),
  });
const payload = () =>
  serialize({
    close: new Float64Array([12.3, 45.6]),
    valid: new Uint8Array([1, 1]),
    states: new Uint8Array([0, 6]),
  });
const options = () => ({
  root,
  sourceIdentity: identity,
  algorithmVersion: algorithm,
});
const store = () => openStockMACheckpointStore(options());
const ns = (source = identity, algo = algorithm) =>
  path.join(root, `ns-${sha(JSON.stringify([source, algo]))}`);
const gen = (head: StockMAStoredGeneration) => path.join(ns(), head.generation);
async function put(
  s: StockMACheckpointStore,
  previous: string | null = null,
  metadata: unknown = { date: "20261106" }
) {
  const tx = await s.begin(previous);
  await Promise.all([
    tx.writeShard("s-0000", payload()),
    tx.writeShard("s-0001", new Uint8Array([8, 7, 6])),
    tx.writeLight(light()),
  ]);
  return tx.commit(metadata);
}
async function writeJson(filename: string, value: unknown) {
  await fs.writeFile(filename, JSON.stringify(value), { mode: 0o600 });
}
async function retiredFixture(writer: StockMACheckpointStore, aged = true) {
  const first = await put(writer);
  const originalPointer = await fs.readFile(path.join(ns(), "HEAD.json"));
  const originalManifest = JSON.parse(
    await fs.readFile(path.join(gen(first), "manifest.json"), "utf8")
  );
  const now = Date.now();
  const oldest = { ...first, generation: `g-${"0".repeat(32)}` };
  for (let i = 0; i < 34; i++) {
    const generation = `g-${i.toString(16).padStart(32, "0")}`;
    const directory = path.join(ns(), generation);
    await fs.mkdir(directory, { mode: 0o700 });
    for (const name of ["light.bin", "shard-s-0000.bin", "shard-s-0001.bin"])
      await fs.copyFile(
        path.join(gen(first), name),
        path.join(directory, name)
      );
    await writeJson(path.join(directory, "manifest.json"), {
      ...originalManifest,
      generation,
      previous: null,
      createdAt: now - (aged ? 25 * 60 * 60 * 1000 : 60_000) + i,
    });
  }
  async function readOld(reader: StockMACheckpointStore) {
    const bytes = await fs.readFile(path.join(gen(oldest), "manifest.json"));
    const pointer = JSON.parse(originalPointer.toString("utf8"));
    pointer.generation = oldest.generation;
    pointer.manifest = { size: bytes.length, sha256: sha(bytes) };
    await writeJson(path.join(ns(), "HEAD.json"), pointer);
    try {
      return (await reader.read())!;
    } finally {
      await fs.writeFile(path.join(ns(), "HEAD.json"), originalPointer);
    }
  }
  return { first, oldest, readOld };
}
async function rewriteHead(
  head: StockMAStoredGeneration,
  change: (value: any) => void
) {
  const file = path.join(gen(head), "manifest.json");
  const manifest = JSON.parse(await fs.readFile(file, "utf8"));
  change(manifest);
  const bytes = Buffer.from(JSON.stringify(manifest));
  await fs.writeFile(file, bytes, { mode: 0o600 });
  const pointerFile = path.join(ns(), "HEAD.json");
  const pointer = JSON.parse(await fs.readFile(pointerFile, "utf8"));
  pointer.manifest = { size: bytes.length, sha256: sha(bytes) };
  await writeJson(pointerFile, pointer);
}
async function child(code: string): Promise<number> {
  const p = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    {
      cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const pid = p.pid!;
  let errors = "";
  p.stderr.on("data", chunk => {
    errors += String(chunk);
  });
  await new Promise<void>((resolve, reject) => {
    p.on("error", reject);
    p.on("close", code =>
      code === 0
        ? resolve()
        : reject(new Error(`Fixture child failed: ${errors}`))
    );
  });
  return pid;
}

beforeEach(async () => {
  temporary = await fs.mkdtemp(path.join(tmpdir(), "stock-ma-checkpoint-"));
  root = path.join(temporary, "cache");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(temporary, { recursive: true, force: true });
});

describe("stock MA checkpoint store contract", () => {
  it("initial read returns null without mkdir; only a writer creates private cache directories", async () => {
    const s = store();
    expect(await s.read()).toBeNull();
    await expect(fs.stat(root)).rejects.toMatchObject({ code: "ENOENT" });
    const tx = await s.begin(null);
    expect(await s.read()).toBeNull();
    await tx.abort();
    expect(await s.read()).toBeNull();
  });

  it("round-trips opaque v8 typed bytes and detached owning light/shard arrays", async () => {
    const s = store();
    const metadata = {
      date: "20261106",
      probe: [1, 2],
      fingerprint: "opaque",
      nested: { ok: true },
    };
    const committed = await put(s, null, metadata);
    metadata.probe[0] = 99;
    committed.light.fill(0);
    const read = (await store().read())!;
    expect(read.generation).toBe(committed.generation);
    expect(read.metadata).toEqual({
      date: "20261106",
      probe: [1, 2],
      fingerprint: "opaque",
      nested: { ok: true },
    });
    expect(read.shardNames).toEqual(["s-0000", "s-0001"]);
    expect(deserialize(read.light)).toEqual(deserialize(light()));
    const shard = await s.readShard(read.generation, "s-0000");
    expect(deserialize(shard)).toEqual(deserialize(payload()));
    shard.fill(0);
    expect(await s.readShard(read.generation, "s-0000")).toEqual(
      new Uint8Array(payload())
    );
    const names = await fs.readdir(root);
    expect(names).toEqual([path.basename(ns())]);
    expect(names.join("")).not.toContain(identity);
    for (const dir of [root, ns(), gen(read)])
      expect((await fs.stat(dir)).mode & 0o777).toBe(0o700);
    for (const name of await fs.readdir(gen(read)))
      expect((await fs.stat(path.join(gen(read), name))).mode & 0o777).toBe(
        0o600
      );
    const pointer = JSON.parse(
      await fs.readFile(path.join(ns(), "HEAD.json"), "utf8")
    );
    const manifest = await fs.readFile(path.join(gen(read), "manifest.json"));
    expect(pointer.manifest).toEqual({
      size: manifest.length,
      sha256: sha(manifest),
    });
    expect((await fs.stat(path.join(ns(), "HEAD.json"))).mode & 0o777).toBe(
      0o600
    );
  });

  it("does not deserialize payloads: even non-v8 bytes and zero-sized blobs are opaque", async () => {
    const s = store();
    const tx = await s.begin(null);
    await tx.writeShard("opaque", new Uint8Array([255, 0, 88]));
    await tx.writeShard("empty", new Uint8Array());
    await tx.writeLight(new Uint8Array([255]));
    const g = await tx.commit(null);
    expect((await s.read())!.light).toEqual(new Uint8Array([255]));
    expect(await s.readShard(g.generation, "empty")).toEqual(new Uint8Array());
  });

  it("safe shard names including light and manifest do not collide with internal files", async () => {
    const s = store();
    const tx = await s.begin(null);
    await tx.writeShard("light", new Uint8Array([4]));
    await tx.writeShard("manifest", new Uint8Array([5]));
    await tx.writeLight(light());
    const g = await tx.commit({});
    expect((await s.read())!.shardNames).toEqual(["light", "manifest"]);
    expect(await s.readShard(g.generation, "light")).toEqual(
      new Uint8Array([4])
    );
  });

  it("never calls non-enumerable toJSON and safely owns copied JSON metadata", async () => {
    const s = store();
    const tx = await s.begin(null);
    await tx.writeLight(light());
    const call = vi.fn(() => {
      throw new Error("must not execute");
    });
    const metadata = Object.defineProperty({ ok: true }, "toJSON", {
      value: call,
    });
    const g = await tx.commit(metadata);
    expect(call).not.toHaveBeenCalled();
    expect(g.metadata).toEqual({ ok: true });
    expect((await s.read())!.metadata).toEqual({ ok: true });
  });

  it("abort and failed commit leave old pointer unchanged and clean their own temporary files", async () => {
    const s = store();
    const old = await put(s);
    const oldPointer = await fs.readFile(path.join(ns(), "HEAD.json"));
    const tx = await s.begin(old.generation);
    await tx.writeShard("pending", new Uint8Array([9]));
    expect((await s.read())!.generation).toBe(old.generation);
    await tx.abort();
    await tx.abort();
    await expect(tx.writeLight(light())).rejects.toThrow("TRANSACTION_CLOSED");
    expect(await fs.readFile(path.join(ns(), "HEAD.json"))).toEqual(oldPointer);
    const failTx = await s.begin(old.generation);
    await failTx.writeShard("pending", payload());
    await expect(failTx.commit({})).rejects.toThrow("LIGHT_REQUIRED");
    expect(await fs.readdir(ns())).toEqual(
      expect.arrayContaining([old.generation, "HEAD.json"])
    );
    expect(
      (await fs.readdir(ns())).some(
        n => n.startsWith(".stage") || n.endsWith(".tmp") || n === "writer.lock"
      )
    ).toBe(false);
  });

  it("staged and orphan generations never become a fake empty committed success", async () => {
    const s = store();
    const tx = await s.begin(null);
    await tx.writeLight(light());
    await fs.mkdir(path.join(ns(), `g-${"a".repeat(32)}`), { mode: 0o700 });
    await fs.writeFile(
      path.join(ns(), `g-${"a".repeat(32)}`, "manifest.json"),
      "garbage",
      { mode: 0o600 }
    );
    expect(await s.read()).toBeNull();
    await expect(s.readShard(`g-${"a".repeat(32)}`, "opaque")).rejects.toThrow(
      "GENERATION_NOT_PINNED"
    );
    await tx.abort();
  });

  it("competing processes and instances refuse live PID owners regardless of expired timestamps", async () => {
    const first = store();
    const tx = await first.begin(null);
    const lockFile = path.join(ns(), "writer.lock");
    const lock = JSON.parse(await fs.readFile(lockFile, "utf8"));
    expect(lock.pid).toBe(process.pid);
    expect(lock.nonce).toMatch(/^[a-f0-9]{32}$/);
    lock.createdAt = 0;
    await writeJson(lockFile, lock);
    await expect(store().begin(null)).rejects.toThrow("WRITER_BUSY");
    expect(JSON.parse(await fs.readFile(lockFile, "utf8")).nonce).toBe(
      lock.nonce
    );
    const module = new URL("./stock-ma-checkpoint-store.ts", import.meta.url)
      .pathname;
    await child(`import { openStockMACheckpointStore as open } from ${JSON.stringify(module)};
      try { await open(${JSON.stringify(options())}).begin(null); process.exitCode = 1; }
      catch (e) { if (!String(e).includes('WRITER_BUSY')) throw e; }`);
    await tx.abort();
  });

  it("concurrent begin yields at most one owner and concurrent transaction writes are serialized", async () => {
    const attempts = await Promise.allSettled([
      store().begin(null),
      store().begin(null),
      store().begin(null),
    ]);
    const winners = attempts.filter(
      (
        r
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<StockMACheckpointStore["begin"]>>
      > => r.status === "fulfilled"
    );
    expect(winners).toHaveLength(1);
    const tx = winners[0].value;
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        tx.writeShard(`s-${i}`, new Uint8Array([i]))
      )
    );
    await tx.writeLight(light());
    const g = await tx.commit({});
    expect(g.shardNames).toHaveLength(12);
  });

  it("CAS rejects a stale begin and stale pointer changed while the writer was staging", async () => {
    const s = store();
    const old = await put(s);
    await expect(s.begin(null)).rejects.toThrow("CAS_MISMATCH");
    const next = await put(s, old.generation);
    await expect(s.begin(old.generation)).rejects.toThrow("CAS_MISMATCH");
    const tx = await s.begin(next.generation);
    await tx.writeLight(light());
    const pointer = JSON.parse(
      await fs.readFile(path.join(ns(), "HEAD.json"), "utf8")
    );
    pointer.generation = old.generation;
    const bytes = await fs.readFile(path.join(gen(old), "manifest.json"));
    pointer.manifest = { size: bytes.length, sha256: sha(bytes) };
    await writeJson(path.join(ns(), "HEAD.json"), pointer);
    const oldPointer = await fs.readFile(path.join(ns(), "HEAD.json"));
    await expect(tx.commit({})).rejects.toThrow("CAS_MISMATCH");
    expect(await fs.readFile(path.join(ns(), "HEAD.json"))).toEqual(oldPointer);
    expect((await s.read())!.generation).toBe(old.generation);
  });

  it("isolates algorithm and source identities including ambiguous string concatenations", async () => {
    const a = store();
    const first = await put(a);
    const b = openStockMACheckpointStore({
      ...options(),
      sourceIdentity: "other-source",
    });
    const c = openStockMACheckpointStore({
      ...options(),
      algorithmVersion: "other-algorithm",
    });
    expect(await b.read()).toBeNull();
    expect(await c.read()).toBeNull();
    const second = await put(b);
    await put(c);
    expect((await a.read())!.generation).toBe(first.generation);
    await expect(b.readShard(first.generation, "s-0000")).rejects.toThrow(
      "GENERATION_NOT_PINNED"
    );
    expect((await b.read())!.generation).toBe(second.generation);
    const x = openStockMACheckpointStore({
      ...options(),
      sourceIdentity: "ab",
      algorithmVersion: "c",
    });
    const y = openStockMACheckpointStore({
      ...options(),
      sourceIdentity: "a",
      algorithmVersion: "bc",
    });
    await put(x);
    expect(await y.read()).toBeNull();
  });

  it.each([
    "shard-s-0000.bin",
    "shard-s-0001.bin",
    "light.bin",
    "manifest.json",
  ])(
    "detects corrupted %s, never reports a fake null/empty snapshot",
    async filename => {
      const s = store();
      const head = await put(s);
      const file = path.join(gen(head), filename);
      const bytes = await fs.readFile(file);
      bytes[0] ^= 1;
      await fs.writeFile(file, bytes);
      await expect(s.read()).rejects.toThrow(/CHECKSUM/);
      if (filename.startsWith("shard-"))
        await expect(
          s.readShard(head.generation, filename.slice(6, -4))
        ).rejects.toThrow("CHECKSUM_MISMATCH");
    }
  );

  it("verifies all shards by streaming, and readShard rechecks pinned manifest digest", async () => {
    const s = store();
    const g = await put(s);
    const readFile = vi.spyOn(fs, "readFile");
    const open = vi.spyOn(fs, "open");
    expect((await s.read())!.generation).toBe(g.generation);
    expect(readFile).not.toHaveBeenCalled();
    expect(
      open.mock.calls.some(([name]) => String(name).endsWith("s-0001.bin"))
    ).toBe(true);
    await rewriteHead(g, head => {
      head.metadata = { changed: true };
    });
    await expect(s.readShard(g.generation, "s-0000")).rejects.toThrow(
      "HEAD_CHECKSUM_MISMATCH"
    );
    await expect(s.read()).rejects.toThrow("PINNED_HEAD_CHANGED");
  });

  it.each([
    "schema",
    "namespace",
    "path",
    "duplicate",
    "oversized",
    "unknown-field",
  ])(
    "validates head %s even with a recomputed pointer checksum",
    async kind => {
      const s = store();
      const g = await put(s);
      // Use another-process-style uncached head by making schema validation run
      // before this process's existing pin check (readShard validates exact digest).
      const file = path.join(gen(g), "manifest.json");
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      if (kind === "schema") value.schema = 99;
      if (kind === "namespace") value.namespace = "b".repeat(64);
      if (kind === "path") value.shards[0].name = "../secret";
      if (kind === "duplicate") value.shards.push(value.shards[0]);
      if (kind === "oversized") value.shards[0].size = 4 * 1024 * 1024 + 1;
      if (kind === "unknown-field") value.unexpected = true;
      const bytes = Buffer.from(JSON.stringify(value));
      await fs.writeFile(file, bytes);
      await expect(s.readShard(g.generation, "s-0000")).rejects.toThrow(
        "HEAD_CHECKSUM_MISMATCH"
      );
      // Fresh subprocess has no process-local pin, so it validates schema/identity.
      const pointer = JSON.parse(
        await fs.readFile(path.join(ns(), "HEAD.json"), "utf8")
      );
      pointer.manifest = { size: bytes.length, sha256: sha(bytes) };
      await writeJson(path.join(ns(), "HEAD.json"), pointer);
      const module = new URL("./stock-ma-checkpoint-store.ts", import.meta.url)
        .pathname;
      await child(`import { openStockMACheckpointStore as open } from ${JSON.stringify(module)};
      try { await open(${JSON.stringify(options())}).read(); process.exitCode = 1; }
      catch (e) { if (!String(e).includes('Stock MA checkpoint:')) throw e; }`);
    }
  );

  it.each(["../outside", "x/y", ".", "..", "x.bin", "", "a\\b", "x\0z"])(
    "refuses unsafe shard basename %j",
    async name => {
      const s = store();
      const tx = await s.begin(null);
      await expect(tx.writeShard(name, payload())).rejects.toThrow(
        "INVALID_BASENAME"
      );
      await expect(s.readShard("../../outside", "ok")).rejects.toThrow(
        "INVALID_BASENAME"
      );
      expect(await s.read()).toBeNull();
    }
  );

  it.each([
    "HEAD.json",
    "manifest.json",
    "shard-s-0000.bin",
    "light.bin",
    "generation",
    "namespace",
    "root",
  ])("refuses symlinks at %s", async which => {
    const s = store();
    const g = await put(s);
    let target =
      which === "root"
        ? root
        : which === "namespace"
          ? ns()
          : which === "generation"
            ? gen(g)
            : which === "HEAD.json"
              ? path.join(ns(), which)
              : path.join(gen(g), which);
    const moved = path.join(temporary, "moved");
    await fs.rename(target, moved);
    await fs.symlink(moved, target);
    await expect(s.read()).rejects.toThrow("SYMLINK_REFUSED");
    if (which === "root" || which === "namespace")
      await expect(s.begin(g.generation)).rejects.toThrow("SYMLINK_REFUSED");
  });

  it("refuses hardlinks and unexpected generation files", async () => {
    const s = store();
    const g = await put(s);
    const shard = path.join(gen(g), "shard-s-0000.bin");
    await fs.link(shard, path.join(temporary, "extra-hardlink"));
    await expect(s.read()).rejects.toThrow("UNSAFE_PATH");
    await fs.unlink(path.join(temporary, "extra-hardlink"));
    await fs.writeFile(path.join(gen(g), "unexpected.bin"), "a", {
      mode: 0o600,
    });
    await expect(s.read()).rejects.toThrow("UNEXPECTED_GENERATION_FILES");
  });

  it("enforces shard/light/head/metadata limits and never runs metadata getters/toJSON", async () => {
    const s = store();
    const shardTx = await s.begin(null);
    await expect(
      shardTx.writeShard("s", new Uint8Array(4 * 1024 * 1024 + 1))
    ).rejects.toThrow("PAYLOAD_TOO_LARGE");
    const lightTx = await s.begin(null);
    await expect(
      lightTx.writeLight(new Uint8Array(32 * 1024 * 1024 + 1))
    ).rejects.toThrow("PAYLOAD_TOO_LARGE");
    const metaTx = await s.begin(null);
    await metaTx.writeLight(light());
    await expect(
      metaTx.commit({ huge: "a".repeat(512 * 1024 + 1) })
    ).rejects.toThrow("METADATA_TOO_LARGE");
    const getter = vi.fn(() => "bad");
    const getterTx = await s.begin(null);
    await getterTx.writeLight(light());
    await expect(
      getterTx.commit(
        Object.defineProperty({}, "date", { get: getter, enumerable: true })
      )
    ).rejects.toThrow("INVALID_METADATA");
    expect(getter).not.toHaveBeenCalled();
    const jsonTx = await s.begin(null);
    await jsonTx.writeLight(light());
    await expect(jsonTx.commit({ toJSON: getter })).rejects.toThrow(
      "INVALID_METADATA"
    );
    expect(getter).not.toHaveBeenCalled();
    const g = await put(s);
    await fs.truncate(
      path.join(gen(g), "shard-s-0001.bin"),
      4 * 1024 * 1024 + 1
    );
    await expect(s.read()).rejects.toThrow("FILE_TOO_LARGE");
    await fs.writeFile(path.join(ns(), "HEAD.json"), " ".repeat(1025));
    await expect(s.read()).rejects.toThrow("FILE_TOO_LARGE");
  });

  it("bounds shard count and refuses duplicate overwrites", async () => {
    const s = store();
    const tx = await s.begin(null);
    for (let i = 0; i < 1024; i++)
      await tx.writeShard(`s-${i}`, new Uint8Array());
    await expect(tx.writeShard("overflow", new Uint8Array())).rejects.toThrow(
      "TOO_MANY_SHARDS"
    );
    const tx2 = await s.begin(null);
    await tx2.writeShard("s", payload());
    await expect(tx2.writeShard("s", payload())).rejects.toThrow(
      "DUPLICATE_SHARD"
    );
    expect(await s.read()).toBeNull();
  }, 20_000);

  it("rolls back stage write failures and suppresses secret filesystem error content", async () => {
    const s = store();
    const g = await put(s);
    const old = await fs.readFile(path.join(ns(), "HEAD.json"));
    const tx = await s.begin(g.generation);
    const original = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(
      async (...args: Parameters<typeof fs.open>) => {
        if (
          String(args[0]).includes(".stage-") &&
          String(args[0]).endsWith("bad.bin")
        ) {
          throw Object.assign(
            new Error("password=must-not-leak /private/location"),
            { code: "EACCES" }
          );
        }
        return original(...args);
      }
    );
    await expect(tx.writeShard("bad", payload())).rejects.toThrow(
      /^Stock MA checkpoint: FILESYSTEM_ERROR$/
    );
    expect(await fs.readFile(path.join(ns(), "HEAD.json"))).toEqual(old);
    expect((await s.read())!.generation).toBe(g.generation);
    expect(
      (await fs.readdir(ns())).some(
        n => n.startsWith(".stage-") || n === "writer.lock"
      )
    ).toBe(false);
  });

  it("pointer rename failure leaves the prior committed pointer byte-for-byte unchanged", async () => {
    const s = store();
    const g = await put(s);
    const old = await fs.readFile(path.join(ns(), "HEAD.json"));
    const tx = await s.begin(g.generation);
    await tx.writeLight(light());
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(from).includes(".head-") && String(to).endsWith("HEAD.json"))
        throw Object.assign(new Error("injected"), { code: "EIO" });
      return rename(from, to);
    });
    await expect(tx.commit({})).rejects.toThrow("FILESYSTEM_ERROR");
    expect(await fs.readFile(path.join(ns(), "HEAD.json"))).toEqual(old);
    expect((await s.read())!.generation).toBe(g.generation);
    expect((await fs.readdir(ns())).filter(n => /^g-/.test(n))).toEqual([
      g.generation,
    ]);
  });

  it("fsync failure after pointer rename restores the old committed pointer", async () => {
    const s = store();
    const g = await put(s);
    const old = await fs.readFile(path.join(ns(), "HEAD.json"));
    const tx = await s.begin(g.generation);
    await tx.writeLight(light());
    const rename = fs.rename.bind(fs),
      open = fs.open.bind(fs);
    let published = false,
      injected = false;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      await rename(from, to);
      if (String(from).includes(".head-") && String(to).endsWith("HEAD.json"))
        published = true;
    });
    vi.spyOn(fs, "open").mockImplementation(
      async (...args: Parameters<typeof fs.open>) => {
        const handle = await open(...args);
        const sync = handle.sync.bind(handle);
        handle.sync = async () => {
          if (String(args[0]) === ns() && published && !injected) {
            injected = true;
            throw Object.assign(new Error("injected"), { code: "EIO" });
          }
          return sync();
        };
        return handle;
      }
    );
    await expect(tx.commit({})).rejects.toThrow("FILESYSTEM_ERROR");
    expect(injected).toBe(true);
    expect(await fs.readFile(path.join(ns(), "HEAD.json"))).toEqual(old);
    expect((await s.read())!.generation).toBe(g.generation);
  });

  it("crashed writer leaves old commit intact and dead PID lock is guarded-reclaimed", async () => {
    const s = store();
    const old = await put(s);
    const module = new URL("./stock-ma-checkpoint-store.ts", import.meta.url)
      .pathname;
    const pid =
      await child(`import { openStockMACheckpointStore as open } from ${JSON.stringify(module)};
      const tx = await open(${JSON.stringify(options())}).begin(${JSON.stringify(old.generation)});
      await tx.writeLight(new Uint8Array([1,2,3]));
      await tx.writeShard('crashed', new Uint8Array([4,5]));
      process.exit(0);`);
    const lock = JSON.parse(
      await fs.readFile(path.join(ns(), "writer.lock"), "utf8")
    );
    expect(lock.pid).toBe(pid);
    expect((await s.read())!.generation).toBe(old.generation);
    const fresh = await s.begin(old.generation);
    const recovered = JSON.parse(
      await fs.readFile(path.join(ns(), "writer.lock"), "utf8")
    );
    expect(recovered.pid).toBe(process.pid);
    expect(recovered.nonce).not.toBe(lock.nonce);
    await fresh.writeLight(light());
    const next = await fresh.commit({ recovered: true });
    expect((await s.read())!.generation).toBe(next.generation);
    expect(
      (await fs.readdir(ns())).some(
        n => n === "writer.lock" || n.startsWith(".reclaim-")
      )
    ).toBe(false);
    // Foreign crash stage is ignored and never guessed/automatically committed.
    expect((await fs.readdir(ns())).some(n => n.startsWith(".stage-"))).toBe(
      true
    );
  });

  it("dead reclaim-guard owner is itself recoverable; malformed locks fail conservatively", async () => {
    const s = store();
    const tx = await s.begin(null);
    await tx.abort();
    const deadPid = await child("process.exit(0)");
    const lockFile = path.join(ns(), "writer.lock");
    const data = {
      schema: 1,
      pid: deadPid,
      nonce: "c".repeat(32),
      createdAt: 0,
    };
    await writeJson(lockFile, data);
    const guard = path.join(
      ns(),
      `.reclaim-${sha(`writer.lock:${data.nonce}`)}`
    );
    await writeJson(guard, { ...data, nonce: "d".repeat(32) });
    const recovered = await s.begin(null);
    await recovered.abort();
    expect((await fs.readdir(ns())).some(n => n.startsWith(".reclaim-"))).toBe(
      false
    );
    await fs.writeFile(lockFile, "malformed", { mode: 0o600 });
    await expect(s.begin(null)).rejects.toThrow("INVALID_JSON");
    expect(await fs.readFile(lockFile, "utf8")).toBe("malformed");
    await writeJson(lockFile, { ...data, pid: "not-a-pid" });
    await expect(s.begin(null)).rejects.toThrow("MALFORMED_LOCK");
  });

  it("nonce ownership mismatch never deletes another writer's lock", async () => {
    const s = store();
    const tx = await s.begin(null);
    const file = path.join(ns(), "writer.lock");
    const owner = JSON.parse(await fs.readFile(file, "utf8"));
    const replaced = { ...owner, nonce: "e".repeat(32) };
    await writeJson(file, replaced);
    await expect(tx.writeLight(light())).rejects.toThrow(
      "LOCK_OWNERSHIP_CHANGED"
    );
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(replaced);
  });

  it("read and readShard never delete generations; pins survive awaits and later commits", async () => {
    const s = store();
    const first = await put(s);
    const pinned = (await s.read())!;
    let previous = first;
    for (let i = 0; i < 4; i++)
      previous = await put(store(), previous.generation, { i });
    await new Promise(resolve => setTimeout(resolve, 5));
    const before = (await fs.readdir(ns())).sort();
    expect(await s.readShard(pinned.generation, "s-0000")).toEqual(
      new Uint8Array(payload())
    );
    expect((await store().read())!.generation).toBe(previous.generation);
    expect((await fs.readdir(ns())).sort()).toEqual(before);
    expect(before.filter(n => /^g-/.test(n)).length).toBeGreaterThanOrEqual(3);
  });

  it.each([false, true])(
    "cleanup keeps 24h grace and in-process pins (aged=%s)",
    async aged => {
      const s = store();
      const first = await put(s);
      const originalPointer = await fs.readFile(path.join(ns(), "HEAD.json"));
      const originalManifest = JSON.parse(
        await fs.readFile(path.join(gen(first), "manifest.json"), "utf8")
      );
      const now = Date.now();
      let oldest = "";
      for (let i = 0; i < 34; i++) {
        const generation = `g-${i.toString(16).padStart(32, "0")}`;
        if (i === 0) oldest = generation;
        const directory = path.join(ns(), generation);
        await fs.mkdir(directory, { mode: 0o700 });
        for (const name of [
          "light.bin",
          "shard-s-0000.bin",
          "shard-s-0001.bin",
        ]) {
          await fs.copyFile(
            path.join(gen(first), name),
            path.join(directory, name)
          );
        }
        const manifest = {
          ...originalManifest,
          generation,
          previous: null,
          createdAt: now - (aged ? 25 * 60 * 60 * 1000 : 60_000) + i,
        };
        await writeJson(path.join(directory, "manifest.json"), manifest);
      }
      // Pin the oldest copied generation, then return HEAD to the initial commit.
      const bytes = await fs.readFile(path.join(ns(), oldest, "manifest.json"));
      const pointer = JSON.parse(originalPointer.toString("utf8"));
      pointer.generation = oldest;
      pointer.manifest = { size: bytes.length, sha256: sha(bytes) };
      await writeJson(path.join(ns(), "HEAD.json"), pointer);
      const pinned = (await s.read())!;
      await fs.writeFile(path.join(ns(), "HEAD.json"), originalPointer);
      const current = await put(s, first.generation);
      const directories = (await fs.readdir(ns())).filter(name =>
        /^g-/.test(name)
      );
      expect(directories.length).toBe(aged ? 32 : 36);
      expect(directories).toEqual(
        expect.arrayContaining([oldest, first.generation, current.generation])
      );
      expect(await s.readShard(pinned.generation, "s-0000")).toEqual(
        new Uint8Array(payload())
      );
    }
  );

  it.each([false, true])(
    "release is memory-only and only aged retired generations over budget are cleaned (aged=%s)",
    async aged => {
      const writer = store(),
        reader = store();
      const { first, oldest, readOld } = await retiredFixture(writer, aged);
      await readOld(reader);
      const open = vi.spyOn(fs, "open"),
        lstat = vi.spyOn(fs, "lstat"),
        rm = vi.spyOn(fs, "rm"),
        unlink = vi.spyOn(fs, "unlink");
      reader.release(oldest.generation);
      reader.release(oldest.generation);
      reader.release(`g-${"f".repeat(32)}`);
      expect(() => reader.release("../outside")).toThrow("INVALID_GENERATION");
      for (const spy of [open, lstat, rm, unlink]) {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      }
      expect((await fs.stat(gen(oldest))).isDirectory()).toBe(true);
      await expect(
        reader.readShard(oldest.generation, "s-0000")
      ).rejects.toThrow("GENERATION_NOT_PINNED");
      await put(writer, first.generation);
      const dirs = (await fs.readdir(ns())).filter(n => /^g-/.test(n));
      expect(dirs).toHaveLength(aged ? 32 : 36);
      if (aged)
        await expect(fs.stat(gen(oldest))).rejects.toMatchObject({
          code: "ENOENT",
        });
      else expect(dirs).toContain(oldest.generation);
    }
  );

  it("does not borrow another instance's pin or remove its ref on release", async () => {
    const writer = store(),
      a = store(),
      b = store(),
      unowned = store();
    const { first, oldest, readOld } = await retiredFixture(writer);
    await readOld(a);
    await readOld(b);
    await expect(
      unowned.readShard(oldest.generation, "s-0000")
    ).rejects.toThrow("GENERATION_NOT_PINNED");
    unowned.release(oldest.generation);
    a.release(oldest.generation);
    a.release(oldest.generation);
    const current = await put(writer, first.generation);
    await expect(a.readShard(oldest.generation, "s-0000")).rejects.toThrow(
      "GENERATION_NOT_PINNED"
    );
    expect(await b.readShard(oldest.generation, "s-0000")).toEqual(
      new Uint8Array(payload())
    );
    b.release(oldest.generation);
    await put(writer, current.generation);
    await expect(fs.stat(gen(oldest))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("repeat reads acquire one owned pin, so one release permits cleanup", async () => {
    const writer = store(),
      reader = store();
    const { first, oldest, readOld } = await retiredFixture(writer);
    await Promise.all([readOld(reader), readOld(reader), readOld(reader)]);
    reader.release(oldest.generation);
    await put(writer, first.generation);
    await expect(fs.stat(gen(oldest))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(reader.readShard(oldest.generation, "s-0000")).rejects.toThrow(
      "GENERATION_NOT_PINNED"
    );
  });

  it("commit and repeated reads share one instance ownership", async () => {
    const writer = store();
    const now = Date.now();
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(now - 25 * 60 * 60 * 1000);
    const first = await put(writer);
    clock.mockRestore();
    await writer.read();
    await writer.read();
    writer.release(first.generation);
    let current = first;
    for (let i = 0; i < 32; i++) {
      const next = await put(writer, current.generation);
      writer.release(current.generation);
      current = next;
    }
    await expect(fs.stat(gen(first))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.readdir(ns())).filter(n => /^g-/.test(n))).toHaveLength(
      32
    );
    expect(await writer.readShard(current.generation, "s-0000")).toEqual(
      new Uint8Array(payload())
    );
  });

  it.each([false, true])(
    "readShard temporary ref protects an await after release and is dropped in finally (fail=%s)",
    async failRead => {
      const writer = store(),
        reader = store();
      const { first, oldest, readOld } = await retiredFixture(writer);
      await readOld(reader);
      let enter!: () => void, resume!: () => void;
      const entered = new Promise<void>(resolve => {
        enter = resolve;
      });
      const paused = new Promise<void>(resolve => {
        resume = resolve;
      });
      const open = fs.open.bind(fs);
      let intercepted = false;
      const spy = vi
        .spyOn(fs, "open")
        .mockImplementation(async (...args: Parameters<typeof fs.open>) => {
          if (
            !intercepted &&
            String(args[0]) === path.join(gen(oldest), "shard-s-0000.bin")
          ) {
            intercepted = true;
            enter();
            await paused;
            if (failRead)
              throw Object.assign(new Error("injected"), { code: "EIO" });
          }
          return open(...args);
        });
      const reading = reader.readShard(oldest.generation, "s-0000");
      // Attach a rejection handler before resuming the deliberately failed read.
      const settled = reading.then(
        value => ({ value }),
        error => ({ error })
      );
      try {
        await entered;
        reader.release(oldest.generation);
        await expect(
          reader.readShard(oldest.generation, "s-0000")
        ).rejects.toThrow("GENERATION_NOT_PINNED");
        const current = await put(writer, first.generation);
        expect((await fs.stat(gen(oldest))).isDirectory()).toBe(true);
        resume();
        const result = await settled;
        if ("error" in result) {
          expect(failRead).toBe(true);
          expect(String(result.error)).toBe(
            "Error: Stock MA checkpoint: FILESYSTEM_ERROR"
          );
        } else {
          expect(failRead).toBe(false);
          expect(result.value).toEqual(new Uint8Array(payload()));
        }
        await put(writer, current.generation);
        await expect(fs.stat(gen(oldest))).rejects.toMatchObject({
          code: "ENOENT",
        });
      } finally {
        resume();
        await settled;
        spy.mockRestore();
      }
    }
  );

  it("durability orders file fsync, generation rename, directory fsync, pointer rename and directory fsync", async () => {
    const events: string[] = [];
    const open = fs.open.bind(fs),
      rename = fs.rename.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(
      async (...args: Parameters<typeof fs.open>) => {
        const handle = await open(...args);
        const sync = handle.sync.bind(handle);
        handle.sync = async () => {
          events.push(`sync:${String(args[0])}`);
          return sync();
        };
        return handle;
      }
    );
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      events.push(`rename:${String(from)}=>${String(to)}`);
      return rename(from, to);
    });
    const g = await put(store());
    const shardSync = events.findIndex(
      e => e.startsWith("sync:") && e.endsWith("s-0000.bin")
    );
    const lightSync = events.findIndex(
      e => e.startsWith("sync:") && e.endsWith("light.bin")
    );
    const manifestSync = events.findIndex(
      e => e.startsWith("sync:") && e.endsWith("manifest.json")
    );
    const genRename = events.findIndex(
      e => e.startsWith("rename:") && e.endsWith(`=>${gen(g)}`)
    );
    const headRename = events.findIndex(
      e =>
        e.startsWith("rename:") &&
        e.endsWith("=>" + path.join(ns(), "HEAD.json"))
    );
    expect(shardSync).toBeGreaterThanOrEqual(0);
    expect(lightSync).toBeGreaterThanOrEqual(0);
    expect(manifestSync).toBeGreaterThanOrEqual(0);
    expect(genRename).toBeGreaterThan(
      Math.max(shardSync, lightSync, manifestSync)
    );
    expect(events.slice(genRename + 1, headRename)).toContain(`sync:${ns()}`);
    expect(events.slice(headRename + 1)).toContain(`sync:${ns()}`);
  });

  it("root must be absolute outside checkout; readonly/failing filesystem is a safe error", async () => {
    for (const invalid of [
      ".",
      "relative",
      "/",
      process.cwd(),
      path.join(process.cwd(), "cache"),
      path.resolve(process.cwd(), ".."),
    ]) {
      expect(() =>
        openStockMACheckpointStore({ ...options(), root: invalid })
      ).toThrow(/INVALID_ROOT|ROOT_INSIDE_CHECKOUT/);
    }
    await fs.mkdir(root, { mode: 0o700 });
    await fs.chmod(root, 0o500);
    try {
      await expect(store().begin(null)).rejects.toThrow("FILESYSTEM_ERROR");
      expect(await store().read()).toBeNull();
    } finally {
      await fs.chmod(root, 0o700);
    }
    await fs.chmod(root, 0o777);
    await expect(store().read()).rejects.toThrow("UNSAFE_PERMISSIONS");
  });
});
