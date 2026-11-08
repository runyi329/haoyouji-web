import { createHash, randomBytes } from "node:crypto";
import { constants, existsSync, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type StockMAStoreOptions = {
  root: string;
  sourceIdentity: string;
  algorithmVersion: string;
};
export type StockMAStoredGeneration = {
  generation: string;
  metadata: unknown;
  shardNames: string[];
  light: Uint8Array;
};
export interface StockMAWriteTransaction {
  writeShard(name: string, bytes: Uint8Array): Promise<void>;
  writeLight(bytes: Uint8Array): Promise<void>;
  commit(metadata: unknown): Promise<StockMAStoredGeneration>;
  abort(): Promise<void>;
}
export interface StockMACheckpointStore {
  read(): Promise<StockMAStoredGeneration | null>;
  readShard(generation: string, name: string): Promise<Uint8Array>;
  release(generation: string): void;
  begin(expectedGeneration: string | null): Promise<StockMAWriteTransaction>;
}

// This is an application market cache, not a database. No payload deserialization,
// environment, logger, credentials, dependencies or source writes occur here.
// Head metadata is bounded JSON; light/shards are opaque (including v8 bytes).
const SCHEMA = 1;
const MAX_HEAD = 2 * 1024 * 1024;
const MAX_METADATA = 512 * 1024;
const MAX_LIGHT = 32 * 1024 * 1024;
const MAX_SHARD = 4 * 1024 * 1024;
const MAX_SHARDS = 1024;
const MAX_TOTAL = 512 * 1024 * 1024;
const MAX_POINTER = 1024;
const MAX_LOCK = 512;
const MIN_AGE = 24 * 60 * 60 * 1000;
const SOFT_GENERATIONS = 32;
const SOFT_DISK_BYTES = 2 * 1024 * 1024 * 1024;
const GENERATION = /^g-[a-f0-9]{32}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const HEX = /^[a-f0-9]{64}$/;
const NONCE = /^[a-f0-9]{32}$/;
// Each instance owns at most one pin per generation until explicit release().
// In-flight reads also hold temporary refs; only the last ref drops the manifest.
// Soft budgets NEVER override pins or the 24h grace for other-process readers.
// Cross-process readers should finish within that grace; indefinite cross-process
// leases would require writable read-side lease files.
const pins = new Map<string, Map<string, { refs: number; manifest: Blob }>>();

type Blob = { size: number; sha256: string };
type Shard = Blob & { name: string };
type Head = {
  schema: number;
  namespace: string;
  generation: string;
  previous: string | null;
  createdAt: number;
  metadata: unknown;
  light: Blob;
  shards: Shard[];
};
type Pointer = {
  schema: number;
  namespace: string;
  generation: string;
  manifest: Blob;
};
type LockData = {
  schema: number;
  pid: number;
  nonce: string;
  createdAt: number;
};
type Lock = { filename: string; data: LockData; dev: number; ino: number };
const fail = (code: string): Error => new Error(`Stock MA checkpoint: ${code}`);
function safe(error: unknown): Error {
  if (
    error instanceof Error &&
    /^Stock MA checkpoint: [A-Z_]+$/.test(error.message)
  )
    return error;
  return fail("FILESYSTEM_ERROR");
}
function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}
const digest = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");
const nonce = (): string => randomBytes(16).toString("hex");
function validGeneration(value: unknown): value is string {
  return typeof value === "string" && GENERATION.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  const found = Object.keys(value);
  return (
    found.length === keys.length && keys.every(k => Object.hasOwn(value, k))
  );
}
function size(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max
  );
}
function blob(value: unknown, max: number): value is Blob {
  return (
    record(value) &&
    exact(value, ["size", "sha256"]) &&
    size(value.size, max) &&
    typeof value.sha256 === "string" &&
    HEX.test(value.sha256)
  );
}
function parse(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw fail("INVALID_JSON");
  }
}
// Never invoke unknown getters/toJSON, silently omit values, or return poisoned
// prototypes. Metadata is JSON, not generic execution or v8 deserialization.
function metadataJSON(value: unknown): string {
  let nodes = 0;
  function visit(v: unknown, depth: number): unknown {
    if (++nodes > 100_000 || depth > 32) throw fail("INVALID_METADATA");
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "string") {
      if (Buffer.byteLength(v) > MAX_METADATA) throw fail("METADATA_TOO_LARGE");
      return v;
    }
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "object" || v === null) throw fail("INVALID_METADATA");
    if (Array.isArray(v)) {
      if (v.length > 100_000) throw fail("INVALID_METADATA");
      const copy: unknown[] = [];
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !("value" in d)) throw fail("INVALID_METADATA");
        copy.push(visit(d.value, depth + 1));
      }
      if (Object.keys(v).length !== v.length) throw fail("INVALID_METADATA");
      return copy;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null)
      throw fail("INVALID_METADATA");
    const copy = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(v)) {
      if (
        ["__proto__", "constructor", "prototype"].includes(key) ||
        key.length > 512
      )
        throw fail("INVALID_METADATA");
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d || !("value" in d)) throw fail("INVALID_METADATA");
      copy[key] = visit(d.value, depth + 1);
    }
    if (Object.getOwnPropertySymbols(v).length) throw fail("INVALID_METADATA");
    return copy;
  }
  const json = JSON.stringify(visit(value, 0));
  if (Buffer.byteLength(json) > MAX_METADATA) throw fail("METADATA_TOO_LARGE");
  return json;
}
function isWithin(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

// lstat every ancestor, and O_NOFOLLOW every file/directory open. This fails closed
// for static symlink/hardlink substitution; cache directories are private 0700.
// Node has no portable openat API: a hostile same-UID actor controlling ancestors
// is outside this local private-cache threat model.
async function checkPath(
  filename: string,
  directory: boolean,
  missing = false
): Promise<boolean> {
  const pieces = filename.split(path.sep).filter(Boolean);
  let current = path.parse(filename).root;
  for (let i = 0; i < pieces.length; i++) {
    current = path.join(current, pieces[i]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (e) {
      if (missing && errorCode(e) === "ENOENT") return false;
      throw e;
    }
    if (stat.isSymbolicLink()) throw fail("SYMLINK_REFUSED");
    const dir = i < pieces.length - 1 || directory;
    if (dir ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)
      throw fail("UNSAFE_PATH");
  }
  return true;
}
async function privateDirectory(dirname: string): Promise<void> {
  await checkPath(dirname, true);
  const stat = await fs.lstat(dirname);
  if (
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw fail("UNSAFE_PERMISSIONS");
}
async function mkdirs(dirname: string): Promise<void> {
  let current = path.parse(dirname).root;
  for (const piece of dirname.split(path.sep).filter(Boolean)) {
    current = path.join(current, piece);
    let created = false;
    try {
      await fs.mkdir(current, { mode: 0o700 });
      created = true;
    } catch (e) {
      if (errorCode(e) !== "EEXIST") throw e;
    }
    await checkPath(current, true);
    if (created) await syncDirectory(path.dirname(current));
  }
  await privateDirectory(dirname);
}
async function syncDirectory(dirname: string): Promise<void> {
  await checkPath(dirname, true);
  const handle = await fs.open(
    dirname,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function openRead(filename: string, max: number): Promise<FileHandle> {
  await checkPath(filename, false);
  const handle = await fs.open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) throw fail("UNSAFE_PATH");
    if (!size(stat.size, max)) throw fail("FILE_TOO_LARGE");
    if ((stat.mode & 0o077) !== 0) throw fail("UNSAFE_PERMISSIONS");
    return handle;
  } catch (e) {
    await handle.close();
    throw e;
  }
}
async function boundedRead(filename: string, max: number): Promise<Uint8Array> {
  const handle = await openRead(filename, max);
  try {
    const before = await handle.stat();
    const bytes = new Uint8Array(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const got = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset
      );
      if (!got.bytesRead) throw fail("FILE_CHANGED");
      offset += got.bytesRead;
    }
    const after = await handle.stat();
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw fail("FILE_CHANGED");
    return bytes;
  } finally {
    await handle.close();
  }
}
async function verifyBlob(
  filename: string,
  expected: Blob,
  max: number,
  collect: boolean
): Promise<Uint8Array | undefined> {
  const handle = await openRead(filename, max);
  try {
    const before = await handle.stat();
    if (before.size !== expected.size) throw fail("SIZE_MISMATCH");
    // read() hashes shards one by one in fixed 64KiB space, NOT 112MB in RAM.
    const chunk = new Uint8Array(64 * 1024);
    const output = collect ? new Uint8Array(expected.size) : undefined;
    const hash = createHash("sha256");
    let offset = 0;
    while (offset < expected.size) {
      const got = await handle.read(
        chunk,
        0,
        Math.min(chunk.length, expected.size - offset),
        offset
      );
      if (!got.bytesRead) throw fail("FILE_CHANGED");
      const part = chunk.subarray(0, got.bytesRead);
      hash.update(part);
      output?.set(part, offset);
      offset += got.bytesRead;
    }
    const after = await handle.stat();
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw fail("FILE_CHANGED");
    if (hash.digest("hex") !== expected.sha256) throw fail("CHECKSUM_MISMATCH");
    return output;
  } finally {
    await handle.close();
  }
}
async function writeDurable(
  filename: string,
  bytes: Uint8Array
): Promise<void> {
  await checkPath(path.dirname(filename), true);
  const handle = await fs.open(
    filename,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (errorCode(e) === "ESRCH") return false;
    if (errorCode(e) === "EPERM") return true;
    throw fail("OWNER_STATUS_UNKNOWN");
  }
}
function pin(namespace: string, generation: string, manifest: Blob): void {
  let set = pins.get(namespace);
  if (!set) {
    set = new Map();
    pins.set(namespace, set);
  }
  const previous = set.get(generation);
  if (
    previous &&
    (previous.manifest.size !== manifest.size ||
      previous.manifest.sha256 !== manifest.sha256)
  )
    throw fail("PINNED_HEAD_CHANGED");
  if (previous) previous.refs++;
  else set.set(generation, { refs: 1, manifest: { ...manifest } });
}
function unpin(namespace: string, generation: string): void {
  const set = pins.get(namespace);
  const held = set?.get(generation);
  if (!held) return;
  if (--held.refs === 0) set!.delete(generation);
  if (set!.size === 0) pins.delete(namespace);
}

export function openStockMACheckpointStore(
  options: StockMAStoreOptions
): StockMACheckpointStore {
  if (
    !options ||
    typeof options.root !== "string" ||
    !path.isAbsolute(options.root) ||
    options.root.includes("\0") ||
    path.resolve(options.root) === path.parse(options.root).root
  )
    throw fail("INVALID_ROOT");
  const root = path.resolve(options.root);
  const moduleFile = fileURLToPath(import.meta.url);
  const moduleDirectory = path.dirname(moduleFile);
  // Bundling moves this file into index.js/preview.mjs: blindly taking its
  // parent would treat /home/ubuntu (or even /) as the checkout and reject all
  // legitimate external caches. Recognize actual project/layout boundaries.
  const checkouts = new Set<string>();
  if (["server", "dist"].includes(path.basename(moduleDirectory)))
    checkouts.add(path.resolve(moduleDirectory, ".."));
  for (const directory of [moduleDirectory, process.cwd()])
    if (
      existsSync(path.join(directory, "package.json")) ||
      existsSync(path.join(directory, ".git"))
    )
      checkouts.add(path.resolve(directory));
  if (
    isWithin(moduleFile, root) ||
    Array.from(checkouts).some(
      checkout => isWithin(root, checkout) || isWithin(checkout, root)
    )
  )
    throw fail("ROOT_INSIDE_CHECKOUT");
  if (
    typeof options.sourceIdentity !== "string" ||
    !options.sourceIdentity.length ||
    options.sourceIdentity.length > 4096 ||
    typeof options.algorithmVersion !== "string" ||
    !options.algorithmVersion.length ||
    options.algorithmVersion.length > 256
  )
    throw fail("INVALID_IDENTITY");
  // Length-delimited identity hashing prevents ambiguous (source, algorithm) joins;
  // raw identity/algo never enters filenames, metadata, errors or logs.
  const identity = digest(
    JSON.stringify([options.sourceIdentity, options.algorithmVersion])
  );
  const namespace = path.join(root, `ns-${identity}`);
  const pointerPath = path.join(namespace, "HEAD.json");
  const ownedPins = new Set<string>();

  function ownPin(generation: string, manifest: Blob): void {
    if (ownedPins.has(generation)) return;
    pin(namespace, generation, manifest);
    ownedPins.add(generation);
  }
  function releaseOwned(generation: string): void {
    if (ownedPins.delete(generation)) unpin(namespace, generation);
  }

  function pointer(value: unknown): Pointer {
    if (
      !record(value) ||
      !exact(value, ["schema", "namespace", "generation", "manifest"]) ||
      value.schema !== SCHEMA ||
      value.namespace !== identity ||
      !validGeneration(value.generation) ||
      !blob(value.manifest, MAX_HEAD)
    )
      throw fail("INVALID_POINTER");
    return value as Pointer;
  }
  function head(value: unknown, generation: string): Head {
    if (
      !record(value) ||
      !exact(value, [
        "schema",
        "namespace",
        "generation",
        "previous",
        "createdAt",
        "metadata",
        "light",
        "shards",
      ]) ||
      value.schema !== SCHEMA ||
      value.namespace !== identity ||
      value.generation !== generation ||
      !(value.previous === null || validGeneration(value.previous)) ||
      value.previous === generation ||
      !size(value.createdAt, Number.MAX_SAFE_INTEGER) ||
      !blob(value.light, MAX_LIGHT) ||
      !Array.isArray(value.shards) ||
      value.shards.length > MAX_SHARDS
    )
      throw fail("INVALID_HEAD");
    metadataJSON(value.metadata);
    const names = new Set<string>();
    let total = value.light.size;
    for (const shard of value.shards) {
      if (
        !record(shard) ||
        !exact(shard, ["name", "size", "sha256"]) ||
        typeof shard.name !== "string" ||
        !NAME.test(shard.name) ||
        names.has(shard.name) ||
        !size(shard.size, MAX_SHARD) ||
        typeof shard.sha256 !== "string" ||
        !HEX.test(shard.sha256)
      )
        throw fail("INVALID_SHARD_DESCRIPTOR");
      names.add(shard.name);
      total += shard.size;
      if (total > MAX_TOTAL) throw fail("GENERATION_TOO_LARGE");
    }
    return value as Head;
  }
  async function getPointer(): Promise<{
    value: Pointer;
    bytes: Uint8Array;
  } | null> {
    if (!(await checkPath(root, true, true))) return null;
    await privateDirectory(root);
    if (!(await checkPath(namespace, true, true))) return null;
    await privateDirectory(namespace);
    if (!(await checkPath(pointerPath, false, true))) return null;
    const bytes = await boundedRead(pointerPath, MAX_POINTER);
    return { value: pointer(parse(bytes)), bytes };
  }
  async function getHead(generation: string, expected?: Blob): Promise<Head> {
    const directory = path.join(namespace, generation);
    await privateDirectory(directory);
    const bytes = await boundedRead(
      path.join(directory, "manifest.json"),
      MAX_HEAD
    );
    if (
      expected &&
      (bytes.length !== expected.size || digest(bytes) !== expected.sha256)
    )
      throw fail("HEAD_CHECKSUM_MISMATCH");
    const result = head(parse(bytes), generation);
    const files = await fs.readdir(directory);
    const allowed = new Set([
      "manifest.json",
      "light.bin",
      ...result.shards.map(s => `shard-${s.name}.bin`),
    ]);
    if (files.length !== allowed.size || files.some(name => !allowed.has(name)))
      throw fail("UNEXPECTED_GENERATION_FILES");
    return result;
  }
  async function loadLock(filename: string): Promise<Lock> {
    const bytes = await boundedRead(filename, MAX_LOCK);
    const data = parse(bytes);
    if (
      !record(data) ||
      !exact(data, ["schema", "pid", "nonce", "createdAt"]) ||
      data.schema !== SCHEMA ||
      !size(data.pid, 2_147_483_647) ||
      data.pid === 0 ||
      typeof data.nonce !== "string" ||
      !NONCE.test(data.nonce) ||
      !size(data.createdAt, Number.MAX_SAFE_INTEGER)
    )
      throw fail("MALFORMED_LOCK");
    const stat = await fs.lstat(filename);
    return { filename, data: data as LockData, dev: stat.dev, ino: stat.ino };
  }
  async function sameLock(lock: Lock): Promise<boolean> {
    const found = await loadLock(lock.filename);
    return (
      found.dev === lock.dev &&
      found.ino === lock.ino &&
      found.data.nonce === lock.data.nonce &&
      found.data.pid === lock.data.pid
    );
  }
  async function release(lock: Lock): Promise<void> {
    if (!(await sameLock(lock))) throw fail("LOCK_OWNERSHIP_CHANGED");
    await fs.unlink(lock.filename);
  }
  async function newLock(filename: string): Promise<Lock> {
    const data: LockData = {
      schema: SCHEMA,
      pid: process.pid,
      nonce: nonce(),
      createdAt: Date.now(),
    };
    await writeDurable(filename, Buffer.from(JSON.stringify(data)));
    return loadLock(filename);
  }
  async function acquire(filename: string, depth = 0): Promise<Lock> {
    if (depth > 16) throw fail("RECLAIM_DEPTH_EXCEEDED");
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        return await newLock(filename);
      } catch (e) {
        if (errorCode(e) !== "EEXIST") throw e;
      }
      let old: Lock;
      try {
        old = await loadLock(filename);
      } catch (e) {
        if (errorCode(e) === "ENOENT") continue;
        throw e;
      }
      if (alive(old.data.pid)) throw fail("WRITER_BUSY");
      // A per-observed-nonce guard serializes dead-owner reclamation. All guard
      // files have PID/nonce owners too; dead guard owners are recursively reclaimed
      // under their OWN nonce guard. Live owners are never stolen due to age.
      const guardPath = path.join(
        namespace,
        `.reclaim-${digest(`${path.basename(filename)}:${old.data.nonce}`)}`
      );
      const guard = await acquire(guardPath, depth + 1);
      try {
        let unchanged = false;
        try {
          unchanged = await sameLock(old);
        } catch (e) {
          if (errorCode(e) !== "ENOENT") throw e;
        }
        if (!unchanged) continue;
        if (alive(old.data.pid)) throw fail("WRITER_BUSY");
        await fs.unlink(filename);
        try {
          return await newLock(filename);
        } catch (e) {
          if (errorCode(e) !== "EEXIST") throw e;
        }
      } finally {
        await release(guard);
      }
    }
    throw fail("WRITER_BUSY");
  }
  async function assertOwner(lock: Lock): Promise<void> {
    if (!(await sameLock(lock))) throw fail("LOCK_OWNERSHIP_CHANGED");
  }
  async function cleanOld(current: string): Promise<void> {
    // Housekeeping is best-effort AFTER a successful commit; failure cannot turn
    // a published generation into a reported rollback. Commit correctness never
    // depends on cleanup. Young/pinned generations may exceed the soft budgets.
    const entries = await fs.readdir(namespace);
    if (entries.length > 10_000) return;
    const found: {
      name: string;
      created: number;
      previous: string | null;
      bytes: number;
    }[] = [];
    for (const name of entries) {
      if (!validGeneration(name)) continue;
      try {
        const manifest = await getHead(name);
        found.push({
          name,
          created: manifest.createdAt,
          previous: manifest.previous,
          bytes:
            manifest.light.size +
            manifest.shards.reduce((n, s) => n + s.size, 0),
        });
      } catch {
        /* Unknown/corrupt directories are never automatically removed. */
      }
    }
    found.sort((a, b) => b.created - a.created || a.name.localeCompare(b.name));
    const keep = new Set(found.slice(0, 3).map(g => g.name));
    keep.add(current);
    // Preserve actual ancestry even if timestamps are equal / clock moved back.
    let previous = found.find(g => g.name === current)?.previous;
    for (let i = 0; i < 2 && previous; i++) {
      keep.add(previous);
      previous = found.find(g => g.name === previous)?.previous;
    }
    let count = found.length,
      bytes = found.reduce((n, g) => n + g.bytes, 0);
    for (const generation of [...found].reverse()) {
      if (count <= SOFT_GENERATIONS && bytes <= SOFT_DISK_BYTES) break;
      if (
        keep.has(generation.name) ||
        pins.get(namespace)?.has(generation.name) ||
        Date.now() - generation.created < MIN_AGE
      )
        continue;
      const directory = path.join(namespace, generation.name);
      // Check every owned file before recursive rm (never follow symlinks).
      const manifest = await getHead(generation.name);
      for (const filename of [
        "manifest.json",
        "light.bin",
        ...manifest.shards.map(s => `shard-${s.name}.bin`),
      ]) {
        await checkPath(path.join(directory, filename), false);
      }
      // getHead/checkPath await: a reader can acquire a pin during those checks.
      // No await separates this last ref check from initiating removal.
      if (pins.get(namespace)?.has(generation.name)) continue;
      await fs.rm(directory, { recursive: true });
      count--;
      bytes -= generation.bytes;
    }
  }

  return {
    async read() {
      let reading: string | undefined;
      try {
        const current = await getPointer();
        if (!current) return null;
        const generation = current.value.generation;
        // Temporary ref protects validation, but failure must not acquire ownership.
        pin(namespace, generation, current.value.manifest);
        reading = generation;
        const manifest = await getHead(generation, current.value.manifest);
        const directory = path.join(namespace, generation);
        const light = (await verifyBlob(
          path.join(directory, "light.bin"),
          manifest.light,
          MAX_LIGHT,
          true
        ))!;
        for (const shard of manifest.shards)
          await verifyBlob(
            path.join(directory, `shard-${shard.name}.bin`),
            shard,
            MAX_SHARD,
            false
          );
        ownPin(generation, current.value.manifest);
        return {
          generation,
          metadata: manifest.metadata,
          shardNames: manifest.shards.map(s => s.name),
          light,
        };
      } catch (e) {
        throw safe(e);
      } finally {
        if (reading) unpin(namespace, reading);
      }
    },
    async readShard(generation, name) {
      let reading = false;
      try {
        if (
          !validGeneration(generation) ||
          typeof name !== "string" ||
          !NAME.test(name)
        )
          throw fail("INVALID_BASENAME");
        // Ownership cannot be borrowed from another instance (or an in-flight read).
        const held = pins.get(namespace)?.get(generation);
        if (!ownedPins.has(generation) || !held)
          throw fail("GENERATION_NOT_PINNED");
        // Acquire synchronously before the first await; release() may now safely
        // drop ownership without exposing this active read to writer cleanup.
        pin(namespace, generation, held.manifest);
        reading = true;
        const manifest = await getHead(generation, held.manifest);
        const shard = manifest.shards.find(s => s.name === name);
        if (!shard) throw fail("SHARD_NOT_FOUND");
        return (await verifyBlob(
          path.join(namespace, generation, `shard-${name}.bin`),
          shard,
          MAX_SHARD,
          true
        ))!;
      } catch (e) {
        throw safe(e);
      } finally {
        if (reading) unpin(namespace, generation);
      }
    },
    release(generation) {
      if (!validGeneration(generation)) throw fail("INVALID_GENERATION");
      // Idempotent for unowned names; memory only, never filesystem housekeeping.
      releaseOwned(generation);
    },
    async begin(expectedGeneration) {
      let lock: Lock | undefined;
      let stage: string | undefined;
      try {
        if (expectedGeneration !== null && !validGeneration(expectedGeneration))
          throw fail("INVALID_GENERATION");
        await mkdirs(root);
        await mkdirs(namespace);
        lock = await acquire(path.join(namespace, "writer.lock"));
        const owned = lock;
        const initial = await getPointer();
        if ((initial?.value.generation ?? null) !== expectedGeneration)
          throw fail("CAS_MISMATCH");
        const generation = `g-${nonce()}`;
        stage = path.join(namespace, `.stage-${nonce()}`);
        const staging = stage;
        const finalDirectory = path.join(namespace, generation);
        await fs.mkdir(staging, { mode: 0o700 });
        const descriptors = new Map<string, Shard>();
        let light: Uint8Array | undefined;
        let lightDescriptor: Blob | undefined;
        let total = 0;
        let state: "open" | "aborted" | "committed" = "open";
        let tail: Promise<unknown> = Promise.resolve();
        let finalCreated = false;
        let pointerPublished = false;
        const pointerTemp = path.join(namespace, `.head-${nonce()}.tmp`);
        const rollbackTemp = path.join(namespace, `.rollback-${nonce()}.tmp`);

        async function discard(): Promise<void> {
          let failure: unknown;
          for (const target of [
            staging,
            ...(finalCreated && !pointerPublished ? [finalDirectory] : []),
          ]) {
            try {
              if (await checkPath(target, true, true)) {
                const files = await fs.readdir(target);
                for (const name of files)
                  await checkPath(path.join(target, name), false);
                await fs.rm(target, { recursive: true });
              }
            } catch (e) {
              failure ??= e;
            }
          }
          for (const filename of [pointerTemp, rollbackTemp]) {
            try {
              if (await checkPath(filename, false, true))
                await fs.unlink(filename);
            } catch (e) {
              failure ??= e;
            }
          }
          try {
            await release(owned);
          } catch (e) {
            failure ??= e;
          }
          if (failure) throw failure;
        }
        function queued<T>(operation: () => Promise<T>): Promise<T> {
          const next = tail.then(async () => {
            if (state !== "open") throw fail("TRANSACTION_CLOSED");
            try {
              await assertOwner(owned);
              return await operation();
            } catch (e) {
              state = "aborted";
              try {
                await discard();
              } catch {
                /* original safe operation error wins */
              }
              throw safe(e);
            }
          });
          tail = next.catch(() => undefined);
          return next;
        }
        function bytesCopy(bytes: Uint8Array, max: number): Uint8Array {
          if (!(bytes instanceof Uint8Array) || !size(bytes.byteLength, max))
            throw fail("PAYLOAD_TOO_LARGE");
          return new Uint8Array(bytes);
        }
        const transaction: StockMAWriteTransaction = {
          writeShard(name, bytes) {
            // Clone only when queued, bounding parallel-write allocation to one
            // shard. Caller must not mutate input until the promise settles.
            return queued(async () => {
              if (typeof name !== "string" || !NAME.test(name))
                throw fail("INVALID_BASENAME");
              if (descriptors.has(name)) throw fail("DUPLICATE_SHARD");
              if (descriptors.size >= MAX_SHARDS) throw fail("TOO_MANY_SHARDS");
              const ownedBytes = bytesCopy(bytes, MAX_SHARD);
              if (total + ownedBytes.length > MAX_TOTAL)
                throw fail("GENERATION_TOO_LARGE");
              await writeDurable(
                path.join(staging, `shard-${name}.bin`),
                ownedBytes
              );
              descriptors.set(name, {
                name,
                size: ownedBytes.length,
                sha256: digest(ownedBytes),
              });
              total += ownedBytes.length;
            });
          },
          writeLight(bytes) {
            return queued(async () => {
              if (light !== undefined) throw fail("DUPLICATE_LIGHT");
              const ownedBytes = bytesCopy(bytes, MAX_LIGHT);
              if (total + ownedBytes.length > MAX_TOTAL)
                throw fail("GENERATION_TOO_LARGE");
              await writeDurable(path.join(staging, "light.bin"), ownedBytes);
              light = ownedBytes;
              lightDescriptor = { size: light.length, sha256: digest(light) };
              total += light.length;
            });
          },
          commit(metadata) {
            return queued(async () => {
              if (light === undefined || !lightDescriptor)
                throw fail("LIGHT_REQUIRED");
              const stableMetadata = parse(Buffer.from(metadataJSON(metadata)));
              const manifest: Head = {
                schema: SCHEMA,
                namespace: identity,
                generation,
                previous: expectedGeneration,
                createdAt: Date.now(),
                metadata: stableMetadata,
                light: lightDescriptor,
                shards: [...descriptors.values()].sort((a, b) =>
                  a.name.localeCompare(b.name)
                ),
              };
              const headBytes = Buffer.from(JSON.stringify(manifest));
              if (headBytes.length > MAX_HEAD) throw fail("HEAD_TOO_LARGE");
              await writeDurable(
                path.join(staging, "manifest.json"),
                headBytes
              );
              await verifyBlob(
                path.join(staging, "light.bin"),
                lightDescriptor,
                MAX_LIGHT,
                false
              );
              for (const shard of manifest.shards)
                await verifyBlob(
                  path.join(staging, `shard-${shard.name}.bin`),
                  shard,
                  MAX_SHARD,
                  false
                );
              await syncDirectory(staging);
              await checkPath(staging, true);
              await fs.rename(staging, finalDirectory);
              finalCreated = true;
              await syncDirectory(namespace);
              const next: Pointer = {
                schema: SCHEMA,
                namespace: identity,
                generation,
                manifest: { size: headBytes.length, sha256: digest(headBytes) },
              };
              await writeDurable(
                pointerTemp,
                Buffer.from(JSON.stringify(next))
              );
              if (initial) await writeDurable(rollbackTemp, initial.bytes);
              await assertOwner(owned);
              const latest = await getPointer();
              if (
                (latest?.value.generation ?? null) !== expectedGeneration ||
                (initial &&
                  (!latest || digest(initial.bytes) !== digest(latest.bytes)))
              )
                throw fail("CAS_MISMATCH");
              let publishingPin = false;
              try {
                await fs.rename(pointerTemp, pointerPath);
                pointerPublished = true;
                await syncDirectory(namespace);
                pin(namespace, generation, next.manifest);
                publishingPin = true;
                // Cleanup stays serialized under this owner; it cannot race a
                // second process publishing a new current/previous ancestry.
                // It is best-effort and never overrides retention safety.
                try {
                  await cleanOld(generation);
                } catch {
                  /* retain rather than unsafe delete */
                }
                // No durable lease is needed after publication; crash leftovers
                // have a dead PID and are guarded-reclaimable on the next begin.
                await release(owned);
                ownPin(generation, next.manifest);
              } catch (e) {
                if (pointerPublished) {
                  try {
                    await assertOwner(owned);
                    if (initial) await fs.rename(rollbackTemp, pointerPath);
                    else await fs.unlink(pointerPath);
                    pointerPublished = false;
                    await syncDirectory(namespace);
                  } catch {
                    throw fail("COMMIT_DURABILITY_UNCERTAIN");
                  }
                }
                throw e;
              } finally {
                if (publishingPin) unpin(namespace, generation);
              }
              state = "committed";
              // Only post-commit housekeeping can be best-effort. Never report a
              // failed commit for a successfully durable, unlocked publication.
              try {
                if (initial) await fs.unlink(rollbackTemp);
              } catch {
                /* harmless durable rollback temp */
              }
              return {
                generation,
                metadata: stableMetadata,
                shardNames: manifest.shards.map(s => s.name),
                light: new Uint8Array(light),
              };
            });
          },
          abort() {
            const next = tail.then(async () => {
              if (state !== "open") return;
              state = "aborted";
              try {
                await discard();
              } catch (e) {
                throw safe(e);
              }
            });
            tail = next.catch(() => undefined);
            return next;
          },
        };
        return transaction;
      } catch (e) {
        if (stage) {
          try {
            if (await checkPath(stage, true, true))
              await fs.rm(stage, { recursive: true });
          } catch {
            /* fail closed */
          }
        }
        if (lock) {
          try {
            await release(lock);
          } catch {
            /* preserve original error */
          }
        }
        throw safe(e);
      }
    },
  };
}
