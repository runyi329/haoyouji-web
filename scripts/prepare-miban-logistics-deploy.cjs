#!/usr/bin/env node
"use strict";
// Production preflight only: no provider calls, database, shipments or wallets.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const CACHE = "/home/ubuntu/.local/share/haoyouji/miban-logistics";
const CALLBACK = "https://jiangyuchen.cn/api/miban/logistics/kuaidi100/callback";
const KEYS = ["KUAIDI100_KEY", "KUAIDI100_CUSTOMER", "KUAIDI100_SUBSCRIPTION_ENABLED", "KUAIDI100_CALLBACK_URL", "MIBAN_LOGISTICS_CACHE_DIR"];
function verify(fileEnv, config, workers) {
  const apps = (config.apps || []).filter(app => app.name === "haoyouji-web");
  if (apps.length !== 1) throw new Error("Logistics preflight: expected production application");
  if (!fileEnv.KUAIDI100_KEY || !fileEnv.KUAIDI100_CUSTOMER || fileEnv.KUAIDI100_SUBSCRIPTION_ENABLED !== "false" || fileEnv.KUAIDI100_CALLBACK_URL !== CALLBACK || fileEnv.MIBAN_LOGISTICS_CACHE_DIR !== CACHE) {
    throw new Error("Logistics preflight: query settings not ready or unverified subscription enabled");
  }
  for (const overriding of [apps[0].env || {}, ...workers.filter(worker => worker.name === "haoyouji-web").map(worker => worker.pm2_env || {})]) {
    for (const key of KEYS) {
      if (Object.hasOwn(overriding, key) && overriding[key] !== fileEnv[key]) {
        throw new Error("Logistics preflight: conflicting PM2 logistics settings");
      }
    }
  }
  return true;
}
function prepareDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const status = fs.lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink() || status.uid !== process.getuid()) throw new Error("Logistics preflight: unsafe private cache directory");
  fs.chmodSync(directory, 0o700);
  fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
}
function main(appDir) {
  appDir = path.resolve(appDir);
  const requireApp = createRequire(path.join(appDir, "package.json"));
  const dotenv = requireApp("dotenv");
  const env = dotenv.parse(fs.readFileSync(path.join(appDir, ".env")));
  const config = requireApp(path.join(appDir, "ecosystem.config.cjs"));
  const workers = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
  verify(env, config, workers);
  prepareDirectory(CACHE);
  console.log(JSON.stringify({ logisticsQueryConfigured: true, subscriptionsEnabled: false, privateCacheReady: true, pm2ConfigurationVerified: true, providerRequestsMade: 0, databaseWrites: false }));
}
module.exports = { verify, prepareDirectory, CACHE, CALLBACK };
if (require.main === module) {
  try { main(process.argv[2] || ""); }
  catch { console.error("Logistics deployment preflight failed; private details were not logged"); process.exitCode = 1; }
}
