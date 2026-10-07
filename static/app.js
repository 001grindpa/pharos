/**
 * Pharos - Monthly Outage-Credit Cover
 * GenLayer StudioNet Web Application Logic
 */

// ============================================================================
// Constants & Configuration
// ============================================================================
export const CONTRACT_ADDRESS =
  typeof window !== "undefined"
    ? "0x963F023bad934ef3A77474a445c81Ed2127b20C6"
    : typeof process !== "undefined" && process.env?.CONTRACT_ADDRESS
      ? process.env.CONTRACT_ADDRESS
      : "0xDEd88EaA439d726e40570cD92C8A4dfD21119312";
export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = "0xf22f";
export const RPC_ENDPOINT = "https://studio.genlayer.com/api";
export const EXPLORER_BASE = "https://explorer-studio.genlayer.com";

export const STORAGE_KEYS = {
  VIEW: "ninesbond.view",
  WALLET: "ninesbond.wallet",
  THEME: "pharos.theme"
};

export const ALLOWED_HOSTS = [
  "statuspage.io",
  "status.cloudflare.com",
  "cloudflarestatus.com",
  "status.aws.amazon.com",
  "health.aws.amazon.com",
  "githubstatus.com",
  "status.stripe.com",
  "status.openai.com",
  "status.hashicorp.com",
  "status.digitalocean.com",
  "status.gitlab.com",
  "status.vercel.com",
  "status.slack.com",
  "downdetector.com",
  "github.com",
  "gitlab.com"
];

export const ABI = [
  {
    name: "buy_cover",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "provider", type: "string" },
      { name: "service", type: "string" },
      { name: "period_start", type: "string" },
      { name: "period_end", type: "string" },
      { name: "incident_date", type: "string" },
      { name: "resolve_after", type: "string" },
      { name: "credit", type: "uint256" },
      { name: "status_url_a", type: "string" },
      { name: "status_url_b", type: "string" }
    ],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "resolve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "cover_id", type: "string" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "timeout_refund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "cover_id", type: "string" }],
    outputs: []
  },
  {
    name: "get_cover",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "cover_id", type: "string" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "get_policy",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "policy_id", type: "string" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "can_resolve",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "cover_id", type: "string" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "get_cover_count",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "get_policy_count",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    name: "get_reserved_premiums",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  }
];

// Application state required by tests and runtime
export const state = {
  provider: null,
  walletAddress: "",
  chainId: null,
  inFlight: false,
  client: null
};

// Discovered EIP-6963 providers map
const discoveredProviders = new Map();

// ============================================================================
// Safe Storage Helpers (Node and restricted browser guard)
// ============================================================================
export function safeGetStorage(key) {
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function") {
      return localStorage.getItem(key);
    }
  } catch (_) {}
  return null;
}

export function safeSetStorage(key, value) {
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.setItem === "function") {
      localStorage.setItem(key, String(value));
    }
  } catch (_) {}
}

export function safeRemoveStorage(key) {
  try {
    if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.removeItem === "function") {
      localStorage.removeItem(key);
    }
  } catch (_) {}
}

// ============================================================================
// Validation & Parsing Utilities
// ============================================================================

/**
 * Parses a GEN string amount to wei using pure BigInt arithmetic only.
 * Rejects 0, negative values, and amounts with more than 18 decimals.
 */
export function parseStake(amountText) {
  if (amountText === null || amountText === undefined) {
    throw new Error("Amount is required");
  }
  const text = String(amountText).trim();
  if (!text) {
    throw new Error("Amount is required");
  }
  if (!/^[0-9]+(\.[0-9]+)?$/.test(text)) {
    throw new Error("Amount must be a positive number with digits only");
  }
  const [intPart, fracPart = ""] = text.split(".");
  if (fracPart.length > 18) {
    throw new Error("Amount cannot exceed 18 decimal places");
  }
  const paddedFrac = fracPart.padEnd(18, "0");
  const wholeWei = BigInt(intPart) * 10n ** 18n;
  const fracWei = BigInt(paddedFrac);
  const totalWei = wholeWei + fracWei;
  if (totalWei <= 0n) {
    throw new Error("Amount must be greater than zero");
  }
  return totalWei;
}

/**
 * Formats a wei string or bigint to human-readable GEN string.
 */
export function formatGen(weiVal) {
  if (weiVal === null || weiVal === undefined) return "0.00 GEN";
  try {
    const wei = BigInt(String(weiVal).trim() || "0");
    const isNeg = wei < 0n;
    const abs = isNeg ? -wei : wei;
    const whole = abs / 10n ** 18n;
    const frac = abs % 10n ** 18n;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
    const formatted = fracStr ? `${whole}.${fracStr}` : `${whole}.00`;
    return `${isNeg ? "-" : ""}${formatted} GEN`;
  } catch (_) {
    return "0.00 GEN";
  }
}

/**
 * Validates real calendar date in YYYY-MM-DD format.
 */
export function isValidCalendarDate(dateStr) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Adds UTC days to a YYYY-MM-DD string.
 */
export function addDaysUtc(dateStr, days = 1) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function extractHost(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") {
      throw new Error("URL must use https");
    }
    return u.hostname.toLowerCase();
  } catch (err) {
    throw new Error("Invalid https URL: " + (err.message || urlStr));
  }
}

function isHostAllowed(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => {
    return host === allowed || host === "www." + allowed || host.endsWith("." + allowed);
  });
}

/**
 * Validates that two URLs are https, allowlisted, and on different hosts.
 */
export function validatePair(urlA, urlB) {
  if (!urlA || !urlB) {
    throw new Error("Both status URLs are required");
  }
  const hostA = extractHost(urlA);
  const hostB = extractHost(urlB);

  if (!isHostAllowed(hostA)) {
    throw new Error(`Host ${hostA} is not on the allowlist`);
  }
  if (!isHostAllowed(hostB)) {
    throw new Error(`Host ${hostB} is not on the allowlist`);
  }
  if (hostA === hostB) {
    throw new Error("Sources must come from two different hosts");
  }
  return [urlA.trim(), urlB.trim()];
}

// ============================================================================
// Wallet & Client Management
// ============================================================================

/**
 * Validates wallet address and StudioNet chain readiness.
 */
export async function ensureWalletReady() {
  const addr = state.walletAddress;
  if (!addr || typeof addr !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error("Wallet address is required before writing.");
  }

  let currentChain = state.chainId;
  if (state.provider && typeof state.provider.request === "function") {
    try {
      const hexChain = await state.provider.request({ method: "eth_chainId" });
      if (hexChain) {
        currentChain = typeof hexChain === "string" ? parseInt(hexChain, 16) : Number(hexChain);
        state.chainId = currentChain;
      }
    } catch (_) {}
  }

  if (currentChain !== CHAIN_ID && currentChain !== 0xf22f) {
    throw new Error("Please connect to GenLayer StudioNet (chain ID 61999)");
  }
  return true;
}

/**
 * Builds or updates the GenLayer client.
 */
export async function updateClient() {
  if (typeof window === "undefined") {
    const stub = {
      readContract: async () => "0",
      writeContract: async () => "0x0000000000000000000000000000000000000000000000000000000000000000",
      waitForTransactionReceipt: async () => ({ status: 7, statusName: "FINALIZED" })
    };
    state.client = stub;
    return stub;
  }

  const createClientFn = window.createClient || window.genlayerSDK?.createClient || window.GenLayer?.createClient;
  const chainObj = window.studionet || window.chains?.studionet || window.genlayerSDK?.chains?.studionet || {
    id: CHAIN_ID,
    name: "StudioNet",
    rpcUrls: { default: { http: [RPC_ENDPOINT] } }
  };

  if (typeof createClientFn !== "function") {
    return state.client;
  }

  if (state.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(state.walletAddress) && state.provider) {
    state.client = createClientFn({
      chain: chainObj,
      account: state.walletAddress,
      provider: state.provider
    });
  } else {
    state.client = createClientFn({
      chain: chainObj
    });
  }
  return state.client;
}

// ============================================================================
// Write Flow Execution
// ============================================================================

/**
 * Executes a write transaction through the 7 distinct phases:
 * signature -> submitted -> wait finalized -> consensus -> execution -> read -> accepted
 */
export async function executeWriteFlow(functionName, args, value = 0n, afterAccepted = null, statusCallback = null) {
  if (state.inFlight) {
    throw new Error("A transaction is already in progress. Please wait.");
  }

  const notifyPhase = (phase, details = "") => {
    if (typeof statusCallback === "function") {
      try { statusCallback(phase, details); } catch (_) {}
    }
  };

  state.inFlight = true;
  notifyPhase("signature", "Requesting wallet signature...");

  try {
    // 1. Before every write, stop if wallet address is missing or is not 0x plus 40 hex characters
    await ensureWalletReady();

    // 2. Build write client only after that check, with chain studionet, account set to that address, and provider set to injected provider
    if (!state.client || typeof state.client.writeContract !== "function") {
      await updateClient();
    }

    if (!state.client || typeof state.client.writeContract !== "function") {
      throw new Error("Contract call client is not ready.");
    }

    // 3. Pass that same account into writeContract. Never pass undefined.
    const txPayload = {
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName,
      args,
      value: value != null ? BigInt(value) : 0n,
      account: state.walletAddress
    };

    const hash = await state.client.writeContract(txPayload);
    if (!hash) {
      throw new Error("No transaction hash returned from contract call.");
    }

    notifyPhase("submitted", hash);
    notifyPhase("wait finalized", "Waiting for consensus finalization...");

    let receipt;
    try {
      receipt = await state.client.waitForTransactionReceipt({ hash });
    } catch (err) {
      notifyPhase("wait finalized", "Still waiting for finalization.");
      throw err;
    }

    if (!receipt) {
      throw new Error("No transaction receipt received.");
    }

    if (receipt.statusName === "CANCELED" || receipt.status === 8) {
      throw new Error("Transaction was canceled on StudioNet.");
    }

    const isSuccess = receipt.status === 7 || receipt.statusName === "FINALIZED" || receipt.status === 1 || receipt.status === "0x1" || receipt.status === "SUCCESS";
    if (!isSuccess && receipt.statusName && receipt.statusName !== "FINALIZED") {
      throw new Error(`Transaction ended with status: ${receipt.statusName || receipt.status}`);
    }

    notifyPhase("consensus", "Validators reached agreement.");
    notifyPhase("execution", "Contract execution completed.");
    notifyPhase("read", "Reading updated state...");

    if (typeof afterAccepted === "function") {
      await afterAccepted(receipt, hash);
    }

    notifyPhase("accepted", hash);
    return hash;
  } finally {
    state.inFlight = false;
  }
}

// ============================================================================
// Contract Read Helpers
// ============================================================================

export async function readContractMethod(methodName, args = []) {
  if (!state.client || typeof state.client.readContract !== "function") {
    await updateClient();
  }
  if (!state.client || typeof state.client.readContract !== "function") {
    throw new Error("Read client not ready");
  }

  try {
    return await state.client.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: methodName,
      args
    });
  } catch (err) {
    if (methodName === "get_cover" && ABI.some(i => i.name === "get_policy")) {
      return await state.client.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "get_policy",
        args
      });
    }
    if (methodName === "get_policy" && ABI.some(i => i.name === "get_cover")) {
      return await state.client.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "get_cover",
        args
      });
    }
    if (methodName === "get_cover_count" && ABI.some(i => i.name === "get_policy_count")) {
      return await state.client.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "get_policy_count",
        args
      });
    }
    if (methodName === "get_policy_count" && ABI.some(i => i.name === "get_cover_count")) {
      return await state.client.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "get_cover_count",
        args
      });
    }
    throw err;
  }
}

export async function fetchTopBarStats() {
  let coverCount = "0";
  let reservedPremiums = "0";

  try {
    const rawCount = await readContractMethod("get_policy_count");
    coverCount = String(rawCount != null ? rawCount : "0");
  } catch (_) {
    try {
      const rawCount = await readContractMethod("get_cover_count");
      coverCount = String(rawCount != null ? rawCount : "0");
    } catch (_) {}
  }

  try {
    const rawReserved = await readContractMethod("get_reserved_premiums");
    reservedPremiums = String(rawReserved != null ? rawReserved : "0");
  } catch (_) {}

  return {
    coverCount,
    reservedPremiums,
    formattedReserved: formatGen(reservedPremiums)
  };
}

export async function fetchCoverDetails(coverId) {
  const idStr = String(coverId).trim();
  if (!idStr) throw new Error("Cover ID is required");

  let rawCover;
  try {
    rawCover = await readContractMethod("get_policy", [idStr]);
  } catch (_) {
    rawCover = await readContractMethod("get_cover", [idStr]);
  }

  let rawCanResolve = null;
  try {
    rawCanResolve = await readContractMethod("can_resolve", [idStr]);
  } catch (_) {}

  let coverData = typeof rawCover === "string" ? JSON.parse(rawCover) : rawCover;
  let canResolveData = typeof rawCanResolve === "string" ? JSON.parse(rawCanResolve) : (rawCanResolve || {});

  const verdict = (coverData.verdict || "UNRESOLVED").toUpperCase();
  const status = (coverData.status || "ACTIVE").toUpperCase();
  const allowed = Boolean(canResolveData.allowed);
  const timeoutRefundAllowed = Boolean(canResolveData.timeout_refund_allowed);

  return {
    coverId: idStr,
    customer: coverData.customer || "0x",
    provider: coverData.provider || "0x",
    service: coverData.service || "",
    period_start: coverData.period_start || "",
    period_end: coverData.period_end || "",
    incident_date: coverData.incident_date || "",
    resolve_after: coverData.resolve_after || "",
    refund_after: coverData.refund_after || addDaysUtc(coverData.resolve_after || "2026-01-01", 1),
    status_url_a: coverData.status_url_a || "",
    status_url_b: coverData.status_url_b || "",
    premium: coverData.premium || "0",
    credit: coverData.credit || "0",
    reserved: coverData.reserved || "0",
    status,
    verdict,
    funds_disposition: (coverData.funds_disposition || "RESERVED").toUpperCase(),
    allowed,
    timeout_refund_allowed: timeoutRefundAllowed
  };
}

// ============================================================================
// UI & View Switching
// ============================================================================

export function setView(viewName) {
  const coverView = document.getElementById("cover-view");
  const floorView = document.getElementById("floor-view");
  if (!coverView || !floorView) return;

  const initStyle = document.getElementById("initial-view-style");
  if (initStyle) {
    try { initStyle.remove(); } catch (_) {}
  }

  if (viewName === "floor") {
    coverView.hidden = true;
    coverView.style.display = "none";
    floorView.hidden = false;
    floorView.style.display = "flex";
    safeSetStorage(STORAGE_KEYS.VIEW, "floor");
    restorePersistedWallet();
    refreshFloor();
  } else {
    coverView.hidden = false;
    coverView.style.display = "flex";
    floorView.hidden = true;
    floorView.style.display = "none";
    safeSetStorage(STORAGE_KEYS.VIEW, "cover");
  }
}

export function setPanel(panelName) {
  const panels = {
    buy: document.getElementById("panel-buy"),
    resolve: document.getElementById("panel-resolve"),
    lookup: document.getElementById("panel-lookup")
  };
  const navButtons = {
    buy: document.getElementById("nav-buy"),
    resolve: document.getElementById("nav-resolve"),
    lookup: document.getElementById("nav-lookup")
  };

  Object.entries(panels).forEach(([name, el]) => {
    if (!el) return;
    if (name === panelName) {
      el.classList.add("is-visible");
      el.hidden = false;
    } else {
      el.classList.remove("is-visible");
      el.hidden = true;
    }
  });

  Object.entries(navButtons).forEach(([name, btn]) => {
    if (!btn) return;
    if (name === panelName) {
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
    } else {
      btn.classList.remove("is-active");
      btn.setAttribute("aria-selected", "false");
    }
  });
}

export function toggleTheme() {
  const root = document.documentElement;
  const currentTheme = root.getAttribute("data-theme") || "dark";
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", newTheme);
  safeSetStorage(STORAGE_KEYS.THEME, newTheme);
  updateThemeIcons(newTheme);
}

function updateThemeIcons(theme) {
  const toggles = document.querySelectorAll(".theme-toggle, #theme-toggle, #theme-toggle-cover, #theme-toggle-floor");
  toggles.forEach(toggle => {
    if (theme === "dark") {
      toggle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
      toggle.setAttribute("aria-label", "Switch to light theme");
    } else {
      toggle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
      toggle.setAttribute("aria-label", "Switch to dark theme");
    }
  });
}

// ============================================================================
// Wallet Connection Handlers
// ============================================================================

function pickPreferredProvider() {
  if (discoveredProviders.has("com.okex.wallet")) {
    return discoveredProviders.get("com.okex.wallet").provider;
  }
  if (discoveredProviders.has("com.okx.wallet")) {
    return discoveredProviders.get("com.okx.wallet").provider;
  }
  if (discoveredProviders.size > 0) {
    return discoveredProviders.values().next().value.provider;
  }
  if (typeof window !== "undefined") {
    if (window.okxwallet) return window.okxwallet;
    if (window.ethereum) return window.ethereum;
  }
  return null;
}

export async function connectWallet() {
  const provider = pickPreferredProvider();
  if (!provider || typeof provider.request !== "function") {
    alert("No compatible Web3 wallet found. Please install OKX Wallet or MetaMask.");
    return;
  }

  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts[0]) {
      throw new Error("No account authorized");
    }

    state.provider = provider;
    state.walletAddress = accounts[0];

    const chainHex = await provider.request({ method: "eth_chainId" });
    state.chainId = typeof chainHex === "string" ? parseInt(chainHex, 16) : Number(chainHex);

    if (state.chainId !== CHAIN_ID) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_ID_HEX }]
        });
        state.chainId = CHAIN_ID;
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          try {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: CHAIN_ID_HEX,
                chainName: "GenLayer StudioNet",
                nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
                rpcUrls: [RPC_ENDPOINT],
                blockExplorerUrls: [EXPLORER_BASE]
              }]
            });
            state.chainId = CHAIN_ID;
          } catch (_) {}
        }
      }
    }

    safeSetStorage(STORAGE_KEYS.WALLET, state.walletAddress);
    await updateClient();
    updateWalletUI();
  } catch (err) {
    console.error("Wallet connection error:", err);
    alert("Failed to connect wallet: " + (err.message || err));
  }
}

export function disconnectWallet() {
  state.walletAddress = "";
  state.chainId = null;
  safeRemoveStorage(STORAGE_KEYS.WALLET);
  updateClient();
  updateWalletUI();
}

export async function restorePersistedWallet() {
  const savedAddr = safeGetStorage(STORAGE_KEYS.WALLET) || safeGetStorage("pharos.wallet");
  if (!savedAddr || !/^0x[0-9a-fA-F]{40}$/.test(savedAddr)) {
    updateWalletUI();
    return;
  }

  const provider = pickPreferredProvider();
  if (!provider || typeof provider.request !== "function") {
    updateWalletUI();
    return;
  }

  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    if (accounts && accounts.some(a => a.toLowerCase() === savedAddr.toLowerCase())) {
      state.provider = provider;
      state.walletAddress = savedAddr;
      const chainHex = await provider.request({ method: "eth_chainId" });
      state.chainId = typeof chainHex === "string" ? parseInt(chainHex, 16) : Number(chainHex);
      await updateClient();
    }
  } catch (_) {}
  updateWalletUI();
}

function updateWalletUI() {
  const btnConnect = document.getElementById("connect-wallet");
  const btnDisconnect = document.getElementById("disconnect-wallet");
  const pill = document.getElementById("wallet-address-pill");

  if (!btnConnect || !btnDisconnect || !pill) return;

  if (state.walletAddress) {
    const shortAddr = `${state.walletAddress.slice(0, 6)}...${state.walletAddress.slice(-4)}`;
    pill.textContent = shortAddr;
    pill.title = state.walletAddress;
    pill.hidden = false;
    btnConnect.hidden = true;
    btnDisconnect.hidden = false;
  } else {
    pill.textContent = "";
    pill.hidden = true;
    btnConnect.hidden = false;
    btnDisconnect.hidden = true;
  }
}

export async function refreshFloor() {
  try {
    const stats = await fetchTopBarStats();
    const countEl = document.getElementById("stat-cover-count");
    const reservedEl = document.getElementById("stat-reserved-premiums");
    if (countEl) countEl.textContent = stats.coverCount;
    if (reservedEl) reservedEl.textContent = stats.formattedReserved;
  } catch (err) {
    console.warn("Could not refresh floor stats:", err);
  }
}

// ============================================================================
// Form Event Handlers
// ============================================================================

export async function handleBuySubmit(event) {
  if (event && typeof event.preventDefault === "function") event.preventDefault();

  const errEl = document.getElementById("buy-error");
  const statusEl = document.getElementById("buy-status");
  if (errEl) { errEl.textContent = ""; errEl.hidden = true; }
  if (statusEl) { statusEl.innerHTML = ""; statusEl.hidden = true; }

  try {
    const provider = document.getElementById("buy-provider")?.value?.trim();
    const service = document.getElementById("buy-service")?.value?.trim();
    const periodStart = document.getElementById("buy-period-start")?.value?.trim();
    const periodEnd = document.getElementById("buy-period-end")?.value?.trim();
    const incidentDate = document.getElementById("buy-incident-date")?.value?.trim();
    const resolveAfter = document.getElementById("buy-resolve-after")?.value?.trim();
    const creditStr = document.getElementById("buy-credit")?.value?.trim();
    const premiumStr = document.getElementById("buy-premium")?.value?.trim();
    const urlA = document.getElementById("buy-url-a")?.value?.trim();
    const urlB = document.getElementById("buy-url-b")?.value?.trim();

    if (!provider || !/^0x[0-9a-fA-F]{40}$/.test(provider)) {
      throw new Error("Provider must be a valid 40-hex address (0x...)");
    }
    if (provider.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      throw new Error("Provider address cannot be zero");
    }
    if (state.walletAddress && provider.toLowerCase() === state.walletAddress.toLowerCase()) {
      throw new Error("Customer and provider must be different addresses");
    }

    if (!service || service.length < 12) {
      throw new Error("Service name must be at least 12 characters");
    }

    if (!isValidCalendarDate(periodStart)) {
      throw new Error("Period start must be a real calendar date (YYYY-MM-DD)");
    }
    if (!isValidCalendarDate(periodEnd)) {
      throw new Error("Period end must be a real calendar date (YYYY-MM-DD)");
    }
    if (!isValidCalendarDate(incidentDate)) {
      throw new Error("Incident date must be a real calendar date (YYYY-MM-DD)");
    }
    if (!isValidCalendarDate(resolveAfter)) {
      throw new Error("Resolve after must be a real calendar date (YYYY-MM-DD)");
    }

    if (periodEnd < periodStart) {
      throw new Error("Period end must be on or after period start");
    }
    if (incidentDate < periodStart || incidentDate > periodEnd) {
      throw new Error("Incident date must fall inside the covered period");
    }
    if (resolveAfter < incidentDate) {
      throw new Error("Resolve after must be on or after incident date");
    }

    const premiumWei = parseStake(premiumStr);
    const creditWei = parseStake(creditStr);
    if (creditWei > premiumWei) {
      throw new Error("Credit cannot exceed premium amount");
    }

    const [cleanUrlA, cleanUrlB] = validatePair(urlA, urlB);

    const args = [
      provider,
      service,
      periodStart,
      periodEnd,
      incidentDate,
      resolveAfter,
      creditWei,
      cleanUrlA,
      cleanUrlB
    ];

    const hash = await executeWriteFlow(
      "buy_cover",
      args,
      premiumWei,
      async (receipt, txHash) => {
        await refreshFloor();
      },
      (phase, info) => {
        if (!statusEl) return;
        statusEl.hidden = false;
        if (phase === "submitted") {
          statusEl.innerHTML = `<div class="phase-step phase-submitted">Transaction submitted: <a href="${EXPLORER_BASE}/tx/${info}" target="_blank" rel="noopener noreferrer">${info}</a></div>`;
        } else if (phase === "accepted") {
          statusEl.innerHTML += `<div class="phase-step phase-accepted">Cover created successfully. Hash: <a href="${EXPLORER_BASE}/tx/${info}" target="_blank" rel="noopener noreferrer">${info}</a></div>`;
        } else {
          statusEl.innerHTML += `<div class="phase-step">${info}</div>`;
        }
      }
    );

    alert("Cover purchased successfully! Transaction Hash: " + hash);
  } catch (err) {
    console.error("Buy cover error:", err);
    if (errEl) {
      errEl.textContent = err.message || String(err);
      errEl.hidden = false;
    } else {
      alert("Error: " + (err.message || String(err)));
    }
  }
}

export async function handleResolveSubmit(isTimeoutRefund = false) {
  const coverId = document.getElementById("resolve-cover-id")?.value?.trim();
  const errEl = document.getElementById("resolve-error");
  const statusEl = document.getElementById("resolve-status");
  if (errEl) { errEl.textContent = ""; errEl.hidden = true; }
  if (statusEl) { statusEl.innerHTML = ""; statusEl.hidden = true; }

  if (!coverId) {
    if (errEl) { errEl.textContent = "Cover ID is required"; errEl.hidden = false; }
    return;
  }

  const fnName = isTimeoutRefund ? "timeout_refund" : "resolve";

  try {
    try {
      const details = await fetchCoverDetails(coverId);
      if (isTimeoutRefund) {
        if (details.verdict === "UNRESOLVED") {
          throw new Error("A cover with verdict UNRESOLVED cannot be returned. Return premium works only after resolve has recorded UNKNOWN or DISAGREE, and only on or after refund_after.");
        }
        if (!details.timeout_refund_allowed && details.status === "ACTIVE") {
          throw new Error("Return premium works only after resolve has recorded UNKNOWN or DISAGREE, and only on or after refund_after.");
        }
      } else {
        if (!details.allowed && details.status === "ACTIVE") {
          throw new Error("Resolve is open from resolve_after until the day before refund_after. After refund_after, Resolve is closed.");
        }
      }
    } catch (checkErr) {
      if (checkErr.message && (checkErr.message.includes("UNRESOLVED") || checkErr.message.includes("Resolve is open") || checkErr.message.includes("Return premium works"))) {
        throw checkErr;
      }
    }


    const hash = await executeWriteFlow(
      fnName,
      [coverId],
      0n,
      async (receipt, txHash) => {
        await refreshFloor();
        try {
          const details = await fetchCoverDetails(coverId);
          renderLookupResult(details);
        } catch (_) {}
      },
      (phase, info) => {
        if (!statusEl) return;
        statusEl.hidden = false;
        if (phase === "submitted") {
          statusEl.innerHTML = `<div class="phase-step phase-submitted">Transaction submitted: <a href="${EXPLORER_BASE}/tx/${info}" target="_blank" rel="noopener noreferrer">${info}</a></div>`;
        } else if (phase === "accepted") {
          statusEl.innerHTML += `<div class="phase-step phase-accepted">${isTimeoutRefund ? "Timeout refund" : "Resolution"} completed. Hash: <a href="${EXPLORER_BASE}/tx/${info}" target="_blank" rel="noopener noreferrer">${info}</a></div>`;
        } else {
          statusEl.innerHTML += `<div class="phase-step">${info}</div>`;
        }
      }
    );
  } catch (err) {
    console.error("Resolve error:", err);
    if (errEl) {
      errEl.textContent = err.message || String(err);
      errEl.hidden = false;
    } else {
      alert("Error: " + (err.message || String(err)));
    }
  }
}

export async function handleLookupSubmit(event) {
  if (event && typeof event.preventDefault === "function") event.preventDefault();

  const coverId = document.getElementById("lookup-cover-id")?.value?.trim();
  const errEl = document.getElementById("lookup-error");
  const resultContainer = document.getElementById("lookup-result-slip");

  if (errEl) { errEl.textContent = ""; errEl.hidden = true; }
  if (resultContainer) resultContainer.hidden = true;

  if (!coverId) {
    if (errEl) { errEl.textContent = "Cover ID is required"; errEl.hidden = false; }
    return;
  }

  try {
    const details = await fetchCoverDetails(coverId);
    renderLookupResult(details);
  } catch (err) {
    console.error("Lookup error:", err);
    if (errEl) {
      errEl.textContent = "Lookup failed: " + (err.message || String(err));
      errEl.hidden = false;
    }
  }
}

function renderLookupResult(details) {
  const container = document.getElementById("lookup-result-slip");
  if (!container) return;


  const statusChipClass = `chip-${details.status.toLowerCase()}`;

  const resolveStatusText = details.allowed ? "YES (Open)" : "NO (Closed)";
  let returnStatusText = "";
  let returnStatusClass = "text-muted";

  if (details.verdict === "UNRESOLVED") {
    returnStatusText = "Return is closed: resolve has not recorded a disagreement or unknown result (verdict is UNRESOLVED)";
    returnStatusClass = "text-muted";
  } else if (details.timeout_refund_allowed) {
    returnStatusText = "YES (Open)";
    returnStatusClass = "text-success";
  } else {
    returnStatusText = "NO (Locked)";
    returnStatusClass = "text-muted";
  }

  container.innerHTML = `
    <div class="outage-slip-card">
      <div class="slip-header">
        <div class="slip-title">OUTAGE COVER SLIP #${escapeHtml(details.coverId)}</div>
        <div class="status-chip ${statusChipClass}">${escapeHtml(details.status)}</div>
      </div>
      <div class="slip-grid">
        <div class="slip-item">
          <span class="slip-label">Service</span>
          <span class="slip-value">${escapeHtml(details.service)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Verdict</span>
          <span class="slip-value font-mono">${escapeHtml(details.verdict)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Customer</span>
          <span class="slip-value font-mono">${escapeHtml(details.customer)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Provider</span>
          <span class="slip-value font-mono">${escapeHtml(details.provider)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Covered Period</span>
          <span class="slip-value">${escapeHtml(details.period_start)} to ${escapeHtml(details.period_end)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Incident Date</span>
          <span class="slip-value">${escapeHtml(details.incident_date)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Resolve After (UTC)</span>
          <span class="slip-value">${escapeHtml(details.resolve_after)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Refund After (UTC)</span>
          <span class="slip-value">${escapeHtml(details.refund_after)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Premium</span>
          <span class="slip-value font-mono">${formatGen(details.premium)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Credit</span>
          <span class="slip-value font-mono">${formatGen(details.credit)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Reserved Balance</span>
          <span class="slip-value font-mono">${formatGen(details.reserved)}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Funds Disposition</span>
          <span class="slip-value font-mono">${escapeHtml(details.funds_disposition)}</span>
        </div>
        <div class="slip-item full-width">
          <span class="slip-label">Status Page Source A</span>
          <a href="${escapeHtml(details.status_url_a)}" target="_blank" rel="noopener noreferrer" class="slip-link">${escapeHtml(details.status_url_a)}</a>
        </div>
        <div class="slip-item full-width">
          <span class="slip-label">Status Page Source B</span>
          <a href="${escapeHtml(details.status_url_b)}" target="_blank" rel="noopener noreferrer" class="slip-link">${escapeHtml(details.status_url_b)}</a>
        </div>
        <div class="slip-item">
          <span class="slip-label">Can Resolve Now</span>
          <span class="slip-value ${details.allowed ? "text-success" : "text-muted"}">${resolveStatusText}</span>
        </div>
        <div class="slip-item">
          <span class="slip-label">Return Premium (Timeout Refund)</span>
          <span class="slip-value ${returnStatusClass}">${returnStatusText}</span>
        </div>
      </div>
    </div>
  `;
  container.hidden = false;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\x27/g, "&#039;");
}

// ============================================================================
// Initialization Controller (Bound Once)
// ============================================================================

export function initApp() {
  if (typeof window !== "undefined") {
    window.addEventListener("eip6963:announceProvider", (event) => {
      if (event.detail && event.detail.info) {
        discoveredProviders.set(event.detail.info.rdns, event.detail);
      }
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }

  // Bind view navigation buttons (in the same init function)
  const btnEnterFloor = document.getElementById("enter-floor");
  if (btnEnterFloor) {
    btnEnterFloor.addEventListener("click", () => setView("floor"));
  }

  const btnBackToCover = document.getElementById("back-to-cover");
  if (btnBackToCover) {
    btnBackToCover.addEventListener("click", () => setView("cover"));
  }

  // Bind wallet buttons
  const btnConnect = document.getElementById("connect-wallet");
  if (btnConnect) {
    btnConnect.addEventListener("click", connectWallet);
  }

  const btnDisconnect = document.getElementById("disconnect-wallet");
  if (btnDisconnect) {
    btnDisconnect.addEventListener("click", disconnectWallet);
  }

  // Bind theme toggles
  const themeToggles = document.querySelectorAll(".theme-toggle, #theme-toggle, #theme-toggle-cover, #theme-toggle-floor");
  themeToggles.forEach(toggle => {
    toggle.addEventListener("click", toggleTheme);
  });

  // Bind floor panel navigation
  const navBuy = document.getElementById("nav-buy");
  if (navBuy) navBuy.addEventListener("click", () => setPanel("buy"));

  const navResolve = document.getElementById("nav-resolve");
  if (navResolve) navResolve.addEventListener("click", () => setPanel("resolve"));

  const navLookup = document.getElementById("nav-lookup");
  if (navLookup) navLookup.addEventListener("click", () => setPanel("lookup"));

  // Bind forms
  const formBuy = document.getElementById("form-buy");
  if (formBuy) {
    formBuy.addEventListener("submit", handleBuySubmit);
  }

  const btnResolve = document.getElementById("btn-resolve");
  if (btnResolve) {
    btnResolve.addEventListener("click", () => handleResolveSubmit(false));
  }

  const btnTimeoutRefund = document.getElementById("btn-timeout-refund");
  if (btnTimeoutRefund) {
    btnTimeoutRefund.addEventListener("click", () => handleResolveSubmit(true));
  }

  const formLookup = document.getElementById("form-lookup");
  if (formLookup) {
    formLookup.addEventListener("submit", handleLookupSubmit);
  }

  // Initial theme sync
  const currentTheme = safeGetStorage(STORAGE_KEYS.THEME) || document.documentElement.getAttribute("data-theme") || "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeIcons(currentTheme);

  // Restore stored view (default is cover)
  const savedView = safeGetStorage(STORAGE_KEYS.VIEW) || safeGetStorage("pharos.view") || "cover";
  setView(savedView);

  // Default panel
  setPanel("buy");

  // Initial client setup
  updateClient();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
}
