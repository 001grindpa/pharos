import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

const app = await import("../../static/app.js");
const {
  CONTRACT_ADDRESS,
  CHAIN_ID,
  ABI,
  state,
  parseStake,
  validatePair,
  ensureWalletReady,
  executeWriteFlow,
  updateClient,
  fetchCoverDetails,
  fetchTopBarStats,
} = app;

if (!state) {
  throw new Error("static/app.js must export state");
}

describe("Pharos", () => {
  beforeEach(() => {
    state.provider = null;
    state.walletAddress = "";
    state.chainId = null;
    state.inFlight = false;
    state.client = null;
  });

  it("exports required constants and state", () => {
    assert.equal(CONTRACT_ADDRESS, "0xADa56B1D824D71ACf22301086c2DEDae52ea74cD");
    assert.equal(CHAIN_ID, 61999);
    assert.ok(Array.isArray(ABI));
    assert.ok(ABI.some((item) => item.name === "buy_cover"));
    assert.ok(ABI.some((item) => item.name === "resolve"));
    assert.ok(ABI.some((item) => item.name === "timeout_refund"));
    assert.equal(ABI.find((item) => item.name === "timeout_refund").inputs.length, 1);
  });

  it("parses stake with bigint only and rejects zero or >18 decimals", () => {
    assert.equal(typeof parseStake, "function");
    assert.equal(parseStake("0.05"), 50000000000000000n);
    assert.equal(parseStake("1"), 1000000000000000000n);
    assert.equal(parseStake("0.000000000000000001"), 1n);
    assert.throws(() => parseStake("0"), /greater than zero/);
    assert.throws(() => parseStake("0.0"), /greater than zero/);
    assert.throws(() => parseStake("1.0000000000000000001"), /18/);
    assert.throws(() => parseStake("abc"), /number|digits/);
  });

  it("rejects a same-host pair and non-allowlisted hosts", () => {
    assert.equal(typeof validatePair, "function");
    assert.throws(
      () => validatePair("https://status.cloudflare.com/a", "https://status.cloudflare.com/b"),
      /different hosts/
    );
    assert.throws(
      () => validatePair("https://invalid-host-xyz.com", "https://githubstatus.com"),
      /allowlist/
    );
    const pair = validatePair(
      "https://status.cloudflare.com/api",
      "https://githubstatus.com/"
    );
    assert.equal(pair.length, 2);
    assert.equal(pair[0], "https://status.cloudflare.com/api");
    assert.equal(pair[1], "https://githubstatus.com/");
  });

  it("refuses a write on the wrong chain or missing address", async () => {
    await assert.rejects(
      () => ensureWalletReady(),
      /Wallet address is required before writing/
    );

    state.walletAddress = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    state.provider = { request: async () => "0x1" };
    state.chainId = 1;
    await assert.rejects(
      () => ensureWalletReady(),
      /61999|StudioNet|chain/
    );
  });

  it("runs executeWriteFlow buy_cover against mock client returning hash and FINALIZED receipt", async () => {
    state.walletAddress = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    state.chainId = 61999;
    state.provider = { request: async () => "0xf22f" };
    const hash = "0x" + "cd".repeat(32);

    let writeCalled = false;
    let afterAcceptedCalled = false;

    state.client = {
      writeContract: async (payload) => {
        writeCalled = true;
        assert.equal(payload.address, CONTRACT_ADDRESS);
        assert.equal(payload.functionName, "buy_cover");
        assert.equal(payload.account, "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
        assert.equal(payload.value, 50000000000000000n);
        return hash;
      },
      waitForTransactionReceipt: async ({ hash: txHash }) => {
        assert.equal(txHash, hash);
        return { status: 7, statusName: "FINALIZED" };
      },
    };

    const out = await executeWriteFlow(
      "buy_cover",
      [
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "GitHub Actions API",
        "2026-09-01",
        "2026-09-30",
        "2026-09-15",
        "2026-12-31",
        50000000000000000n,
        "https://status.cloudflare.com",
        "https://githubstatus.com",
      ],
      50000000000000000n,
      async (receipt, txHash) => {
        afterAcceptedCalled = true;
        assert.equal(receipt.statusName, "FINALIZED");
        assert.equal(txHash, hash);
      }
    );

    assert.equal(out, hash);
    assert.equal(writeCalled, true);
    assert.equal(afterAcceptedCalled, true);
    assert.equal(state.inFlight, false);
  });

  it("uses the neutral read caller for lookup and count reads", async () => {
    const readPayloads = [];
    let readClientOptions;
    globalThis.window = {
      createClient: (options) => {
        if (options.account === null) {
          readClientOptions = options;
        }
        return {
          readContract: async (payload) => {
            readPayloads.push(payload);
            if (payload.functionName === "get_policy") {
              return JSON.stringify({
                status: "REFUNDED",
                verdict: "EXPIRED",
                funds_disposition: "PREMIUM_RETURNED_TO_CUSTOMER",
              });
            }
            if (payload.functionName === "get_policy_count") {
              return "1";
            }
            if (payload.functionName === "get_reserved_premiums") {
              return "50000000000000000";
            }
            if (payload.functionName === "can_resolve") {
              return JSON.stringify({
                allowed: false,
                timeout_refund_allowed: false,
              });
            }
            throw new Error(`Unexpected lookup method: ${payload.functionName}`);
          },
        };
      },
    };

    try {
      await updateClient();
      const details = await fetchCoverDetails("1");
      assert.equal(details.status, "REFUNDED");
      assert.equal(details.verdict, "EXPIRED");
      assert.ok(readClientOptions);
      const stats = await fetchTopBarStats();
      assert.equal(stats.coverCount, "1");
      assert.ok(readPayloads.length >= 4);
      assert.ok(readPayloads.every(
        (payload) => payload.account?.address === "0x0000000000000000000000000000000000000000"
          && !("from" in payload)
      ));
    } finally {
      delete globalThis.window;
    }
  });
});
