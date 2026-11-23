#!/usr/bin/env node
"use strict";

// Run on the production host BEFORE switching dist. Never seeds suppliers, users,
// ownership or logistics. stdout contains readiness flags only, never credentials.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");

const TABLES = [
  `CREATE TABLE IF NOT EXISTS miban_suppliers (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX miban_suppliers_active_idx (active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS miban_supplier_members (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, supplier_id INT NOT NULL, user_id INT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY miban_supplier_member_unique (supplier_id,user_id),
      INDEX miban_supplier_member_user_idx (user_id,active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS miban_supplier_series (
      series_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
      supplier_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX miban_supplier_series_supplier_idx (supplier_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS miban_supplier_order_scope (
      order_id INT NOT NULL PRIMARY KEY,
      series_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      supplier_id INT NULL, source VARCHAR(32) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX miban_supplier_scope_supplier_idx (supplier_id,order_id),
      INDEX miban_supplier_scope_series_idx (series_key,supplier_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS miban_supplier_audit (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, actor_id INT NOT NULL, supplier_id INT NULL,
      order_id INT NULL, action VARCHAR(64) NOT NULL, before_json JSON NULL, after_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX miban_supplier_audit_supplier_idx (supplier_id,created_at),
      INDEX miban_supplier_audit_order_idx (order_id),
      INDEX miban_supplier_audit_actor_idx (actor_id,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];
const STRUCTURES = [
  { name: "miban_suppliers", columns: ["id", "name", "active", "created_at", "updated_at"], indexes: { PRIMARY: ["id"], miban_suppliers_active_idx: ["active"] } },
  { name: "miban_supplier_members", columns: ["id", "supplier_id", "user_id", "active", "created_at", "updated_at"], indexes: { PRIMARY: ["id"], miban_supplier_member_unique: ["supplier_id", "user_id"], miban_supplier_member_user_idx: ["user_id", "active"] }, unique: ["miban_supplier_member_unique"] },
  { name: "miban_supplier_series", columns: ["series_key", "supplier_id", "created_at", "updated_at"], indexes: { PRIMARY: ["series_key"], miban_supplier_series_supplier_idx: ["supplier_id"] }, binary: ["series_key"] },
  { name: "miban_supplier_order_scope", columns: ["order_id", "series_key", "supplier_id", "source", "created_at", "updated_at"], indexes: { PRIMARY: ["order_id"], miban_supplier_scope_supplier_idx: ["supplier_id", "order_id"], miban_supplier_scope_series_idx: ["series_key", "supplier_id"] }, binary: ["series_key"] },
  { name: "miban_supplier_audit", columns: ["id", "actor_id", "supplier_id", "order_id", "action", "before_json", "after_json", "created_at"], indexes: { PRIMARY: ["id"], miban_supplier_audit_supplier_idx: ["supplier_id", "created_at"], miban_supplier_audit_order_idx: ["order_id"], miban_supplier_audit_actor_idx: ["actor_id", "created_at"] }, json: ["before_json", "after_json"] },
];
function strings(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => typeof item === "string"));
}
function validateRuntime(appDir, config, running, fileEnv, shellEnv) {
  const apps = (config.apps || []).filter(app => app.name === "haoyouji-web");
  if (apps.length !== 1) throw new Error("Expected exactly one haoyouji-web PM2 application configuration");
  const app = apps[0];
  // Workflow explicitly changes into appDir before PM2 start/restart.
  const cwd = path.resolve(appDir, app.cwd || ".");
  if (cwd !== path.resolve(appDir) || path.resolve(cwd, app.script || "") !== path.join(path.resolve(appDir), "dist/index.js")) {
    throw new Error("PM2 cwd/script differs from the verified production application");
  }
  const workers = running.filter(item => item.name === "haoyouji-web");
  for (const worker of workers) {
    if (worker.pm2_env?.pm_cwd !== cwd || worker.pm2_env?.pm_exec_path !== path.join(cwd, "dist/index.js")) {
      throw new Error("Actual PM2 worker cwd/script differs from the verified production application");
    }
  }
  const effective = workers.length ? workers.map(worker => ({ ...fileEnv, ...strings(worker.pm2_env), ...strings(shellEnv), ...strings(app.env) })) : [{ ...fileEnv, ...strings(shellEnv), ...strings(app.env) }];
  for (const env of effective) {
    if (env.FAST_PREVIEW === "true" || env.USE_DEV_DB === "true") throw new Error("Production cannot use FAST_PREVIEW or USE_DEV_DB");
    if (env.DOTENV_CONFIG_PATH || env.DOTENV_CONFIG_OVERRIDE && env.DOTENV_CONFIG_OVERRIDE !== "false") throw new Error("Unsupported custom dotenv runtime configuration");
  }
  workers.forEach((worker, index) => {
    const old = { ...fileEnv, ...strings(worker.pm2_env) };
    const oldKey = old.MIBAN_FULFILLMENT_SECRET || old.JWT_SECRET;
    const nextKey = effective[index].MIBAN_FULFILLMENT_SECRET || effective[index].JWT_SECRET;
    if (oldKey && nextKey && oldKey !== nextKey) throw new Error("Restart would unexpectedly rotate the existing signing configuration");
  });
  return effective;
}
function mainDatabaseUrl(env, fallback) {
  const selected = env.ORIGINAL_DATABASE_URL || (env.ORIGINAL_DATABASE_URL ?? fallback) || env.DATABASE_URL;
  if (!selected) throw new Error("Production main database configuration is empty");
  return selected;
}
function bundleDatabaseFallback(bundle) {
  // esbuild may hoist the declaration and assign inside an __esm initializer.
  const matches = [...bundle.matchAll(/\bTENCENT_CLOUD_DB_URL\s*=\s*("(?:[^"\\]|\\.)*")\s*;/g)];
  if (matches.length !== 1) throw new Error("Cannot identify the verified bundle main-database fallback");
  const value = JSON.parse(matches[0][1]);
  if (typeof value !== "string" || !value.startsWith("mysql://")) throw new Error("Cannot identify the verified bundle main-database fallback");
  return value;
}
function columnSpec(structure, name) {
  const lengths = { name: 100, series_key: 64, source: 32, action: 64 };
  if (lengths[name]) return { type: `varchar(${lengths[name]})`, nullable: false, default: null };
  if (name === "active") return { type: "tinyint(1)", nullable: false, default: "1" };
  if (name === "created_at" || name === "updated_at") return { type: "timestamp", nullable: false, default: "current_timestamp", update: name === "updated_at" };
  if (name === "before_json" || name === "after_json") return { type: "json", nullable: true, default: null };
  return {
    type: "int",
    nullable: name === "supplier_id" && structure.name !== "miban_supplier_members" || name === "order_id" && structure.name === "miban_supplier_audit",
    default: null,
    auto: name === "id",
  };
}
function verifyColumn(column, spec) {
  const type = String(column.Type).toLowerCase().replace(/^int\(11\)$/, "int");
  const value = column.Default === null ? null : String(column.Default).toLowerCase().replace(/\(\)$/, "");
  const extra = String(column.Extra || "").toLowerCase();
  return type === spec.type && (column.Null === "YES") === !!spec.nullable && value === spec.default
    && extra.includes("auto_increment") === !!spec.auto
    && /on update current_timestamp(?:\(\))?/.test(extra) === !!spec.update
    && !/virtual generated|stored generated/.test(extra);
}
function writeDedicatedSecret(envFile, parse, effective, overriding = []) {
  const secrets = effective.map(env => env.MIBAN_FULFILLMENT_SECRET || env.JWT_SECRET || "");
  if (secrets.every(Boolean)) {
    if (new Set(secrets).size !== 1) throw new Error("Workers have different fulfillment signing configurations");
    return false;
  }
  if (secrets.some(Boolean)) throw new Error("Only some workers have a fulfillment signing configuration");
  const stat = fs.lstatSync(envFile);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Cannot safely update production environment file");
  // An explicit empty PM2/shell key would override dotenv; do not silently create
  // a file-only key which those processes would never consume.
  if (overriding.some(env => Object.hasOwn(env, "MIBAN_FULFILLMENT_SECRET"))) {
    throw new Error("An overriding empty dedicated secret requires a PM2 configuration correction");
  }
  const current = fs.readFileSync(envFile, "utf8");
  const parsed = parse(current);
  if (parsed.MIBAN_FULFILLMENT_SECRET) throw new Error("Production signing key is overridden by a process setting");
  const key = crypto.randomBytes(32).toString("hex");
  // Remove only an empty assignment to the NEW dedicated key, never JWT_SECRET.
  const cleaned = current.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?MIBAN_FULFILLMENT_SECRET\s*=/.test(line)).join("\n");
  const next = cleaned.replace(/\n*$/, "\n") + `MIBAN_FULFILLMENT_SECRET=${key}\n`;
  const temporary = `${envFile}.miban-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    try { fs.writeFileSync(fd, next); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    // Fail closed if someone changed the environment while it was being prepared.
    if (fs.readFileSync(envFile, "utf8") !== current) throw new Error("Production environment changed concurrently");
    fs.renameSync(temporary, envFile);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  effective.forEach(env => { env.MIBAN_FULFILLMENT_SECRET = key; });
  return true;
}
async function ensureAndVerify(db) {
  for (const statement of TABLES) await db.execute(statement);
  for (const structure of STRUCTURES) {
    const [columns] = await db.execute(`SHOW FULL COLUMNS FROM \`${structure.name}\``);
    const byName = new Map(columns.map(column => [column.Field, column]));
    if (structure.columns.some(name => !byName.has(name))) throw new Error(`Supplier table columns differ: ${structure.name}`);
    for (const name of structure.columns) {
      if (!verifyColumn(byName.get(name), columnSpec(structure, name))) throw new Error(`Supplier column attributes differ: ${structure.name}.${name}`);
    }
    for (const name of structure.binary || []) if (byName.get(name).Collation !== "utf8mb4_bin") throw new Error(`Supplier series collation differs: ${structure.name}`);
    for (const name of structure.json || []) if (String(byName.get(name).Type).toLowerCase() !== "json") throw new Error(`Supplier audit type differs: ${structure.name}`);
    const [indexes] = await db.execute(`SHOW INDEX FROM \`${structure.name}\``);
    for (const [name, expected] of Object.entries(structure.indexes)) {
      const actual = indexes.filter(index => index.Key_name === name).sort((a, b) => a.Seq_in_index - b.Seq_in_index);
      if (JSON.stringify(actual.map(index => index.Column_name)) !== JSON.stringify(expected)) throw new Error(`Supplier table index differs: ${structure.name}.${name}`);
      if ((name === "PRIMARY" || structure.unique?.includes(name)) && actual.some(index => Number(index.Non_unique) !== 0)) throw new Error(`Supplier unique index differs: ${structure.name}.${name}`);
    }
    const [engine] = await db.execute("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", [structure.name]);
    if (engine[0]?.ENGINE !== "InnoDB") throw new Error(`Supplier table is not transactional: ${structure.name}`);
  }
  const lock = `miban.preflight.${crypto.randomBytes(12).toString("hex")}`;
  const [acquired] = await db.execute("SELECT GET_LOCK(?,0) AS acquired", [lock]);
  if (Number(acquired[0]?.acquired) !== 1) throw new Error("MySQL named-lock capability is unavailable");
  const [released] = await db.execute("SELECT RELEASE_LOCK(?) AS released", [lock]);
  if (Number(released[0]?.released) !== 1) throw new Error("MySQL named-lock session release failed");
}
async function main() {
  const appDir = path.resolve(process.argv[2] || "");
  const releaseDir = path.resolve(process.argv[3] || "");
  const envFile = path.join(appDir, ".env");
  const requireApp = createRequire(path.join(appDir, "package.json"));
  const dotenv = requireApp("dotenv");
  const mysql = requireApp("mysql2/promise");
  process.chdir(appDir);
  const config = requireApp(path.join(appDir, "ecosystem.config.cjs"));
  const running = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
  const effective = validateRuntime(appDir, config, running, dotenv.parse(fs.readFileSync(envFile)), process.env);
  const app = config.apps.find(item => item.name === "haoyouji-web");
  const overriding = [process.env, app.env || {}, ...running.filter(item => item.name === "haoyouji-web").map(item => item.pm2_env || {})];
  // Use the SAME fallback as the exact bundle being deployed, without duplicating
  // its existing credential in this script or exposing it in logs.
  const bundle = fs.readFileSync(path.join(releaseDir, "index.js"), "utf8");
  const fallback = bundleDatabaseFallback(bundle);
  const urls = effective.map(env => mainDatabaseUrl(env, fallback));
  if (new Set(urls).size !== 1) throw new Error("Workers have different main database configurations");
  const created = writeDedicatedSecret(envFile, dotenv.parse, effective, overriding);
  const uri = urls[0];
  const db = await mysql.createConnection({ uri, connectTimeout: 30000, ssl: /(?:localhost|127\.0\.0\.1)/.test(uri) ? false : { rejectUnauthorized: false }, charset: "utf8mb4" });
  try { await ensureAndVerify(db); } finally { await db.end(); }
  console.log(JSON.stringify({ supplierTablesReady: 5, sharedFulfillmentSecretReady: true, dedicatedSecretCreated: created, productionRuntimeVerified: true, namedLockVerified: true, supplierAssignmentsImported: false, orderOrWalletWrites: false }));
}
module.exports = { TABLES, STRUCTURES, validateRuntime, mainDatabaseUrl, bundleDatabaseFallback, columnSpec, verifyColumn, writeDedicatedSecret, ensureAndVerify };
if (require.main === module) main().catch(error => {
  // Database error messages can embed connection details; only emit safe codes.
  const code = typeof error.code === "string" ? error.code : null;
  const safe = /^(Expected exactly|PM2 |Actual PM2 |Production |Unsupported custom|Restart would|Workers |Only some |Cannot safely|An overriding|Cannot identify|Supplier |MySQL named-lock)/.test(error.message || "");
  console.error(code ? `Supplier deployment preflight failed (${code})` : safe ? `Supplier deployment preflight failed: ${error.message}` : "Supplier deployment preflight failed (private runtime/configuration error)");
  process.exitCode = 1;
});
