import { describe, expect, it } from "vitest";
import { stockMAPersistenceOptions } from "./stock-ma-persistence-config";

function pool(
  host = "market.example.invalid",
  database = "market",
  password = "fixture-secret"
) {
  return {
    pool: {
      config: {
        connectionConfig: {
          host,
          port: 3306,
          database,
          user: "fixture",
          password,
        },
      },
    },
  };
}

describe("market checkpoint production configuration", () => {
  it("defaults to a deploy-independent user cache directory in production", () => {
    const options = stockMAPersistenceOptions(
      pool(),
      { NODE_ENV: "production" },
      "/home/fixture"
    );
    expect(options?.root).toBe("/home/fixture/.cache/haoyouji-web/stock-ma");
    expect(options?.sourceIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(options)).not.toMatch(
      /fixture-secret|market\.example|3306/
    );
  });
  it("never enables disk persistence for ordinary injected/dev adapters", () => {
    expect(
      stockMAPersistenceOptions(pool(), { NODE_ENV: "development" })
    ).toBeNull();
    expect(
      stockMAPersistenceOptions({}, { NODE_ENV: "production" })
    ).toBeNull();
    expect(
      stockMAPersistenceOptions(null, { NODE_ENV: "production" })
    ).toBeNull();
  });
  it("explicit preview directory is separate and requires an absolute path", () => {
    expect(
      stockMAPersistenceOptions(pool(), {
        NODE_ENV: "development",
        STOCK_MA_STATE_DIR: "/tmp/offline-preview",
      })?.root
    ).toBe("/tmp/offline-preview");
    expect(
      stockMAPersistenceOptions(pool(), {
        NODE_ENV: "production",
        STOCK_MA_STATE_DIR: "./cache",
      })
    ).toBeNull();
    expect(
      stockMAPersistenceOptions(pool(), {
        NODE_ENV: "production",
        STOCK_MA_PERSISTENCE_DISABLED: "1",
      })
    ).toBeNull();
  });
  it("different datasets never share an identity; password rotation does not duplicate public market files", () => {
    const env = { NODE_ENV: "production" };
    const a = stockMAPersistenceOptions(pool(), env)!;
    expect(
      stockMAPersistenceOptions(
        pool("market.example.invalid", "market", "changed-secret"),
        env
      )?.sourceIdentity
    ).toBe(a.sourceIdentity);
    expect(
      stockMAPersistenceOptions(pool("other.example.invalid"), env)
        ?.sourceIdentity
    ).not.toBe(a.sourceIdentity);
    expect(
      stockMAPersistenceOptions(pool("market.example.invalid", "other"), env)
        ?.sourceIdentity
    ).not.toBe(a.sourceIdentity);
  });
  it("incomplete database identity or invalid ports cannot opt into persistence", () => {
    for (const port of [0, -1, 70000, "3306", 1.5]) {
      const p = pool();
      (p.pool.config.connectionConfig.port as unknown) = port;
      expect(
        stockMAPersistenceOptions(p, { NODE_ENV: "production" })
      ).toBeNull();
    }
    const p = pool();
    p.pool.config.connectionConfig.database = "";
    expect(stockMAPersistenceOptions(p, { NODE_ENV: "production" })).toBeNull();
  });
});
