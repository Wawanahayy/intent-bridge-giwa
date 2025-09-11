"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Address,
  formatEther,
  parseEther,
  createPublicClient,
  http,
} from "viem";
import {
  makePublicL1,
  makePublicL2,
  makeWalletL1,
  makeWalletL2,
  getL2TransactionHashes,
} from "@/lib/giwa";
import { makePublicBaseL2, ADD_BASE } from "@/lib/base";
import { connectWallet, ensureChain, createLock } from "@/lib/wallet";
import { pipeline_3routers_baseUsdc_to_giwaEth } from "@/lib/pipeline";
import { runSwapOnly, type SwapDirection } from "@/lib/run-swap-only";
import { sepolia } from "viem/chains";

const ADD_SEPOLIA = {
  chainId: "0xaa36a7",
  chainName: "Sepolia",
  rpcUrls: [process.env.NEXT_PUBLIC_RPC_SEPOLIA || "https://sepolia.drpc.org"],
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};
const ADD_GIWA = {
  chainId: "0x164ce",
  chainName: "Giwa Sepolia",
  rpcUrls: [process.env.NEXT_PUBLIC_RPC_GIWA || "https://sepolia-rpc.giwa.io"],
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: [],
};

const isAddress = (s?: string) => !!s && /^0x[a-fA-F0-9]{40}$/.test(s);
const isNum = (s?: string) => !!s && /^\d+(\.\d+)?$/.test(s || "");
function normalizeCmd(input: string) {
  return input
    .toLowerCase()
    .replace(/[=]/g, " ")
    .replace(/->|=>|→/g, " to ")
    .replace(/\bti\b/g, " to ")
    .replace(/\bke\b/g, " to ")
    .replace(/\s+/g, " ")
    .trim();
}
function firstNumberStr(s: string): string | null {
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return m[1].replace(",", ".");
}
function hasWord(s: string, w: string) {
  const re = new RegExp(`\\b${w}\\b`, "i");
  return re.test(s);
}
function includesPhrase(s: string, phrase: string) {
  const re = new RegExp(
    phrase
      .toLowerCase()
      .split(/\s+/)
      .map((k) => `\\b${k}\\b`)
      .join("\\s+"),
    "i"
  );
  return re.test(s);
}

type Mode =
  | "L1_TO_L2"
  | "L2_TO_L1"
  | "PIPELINE_3R_USDCBASE_TO_ETHGIWA"
  | "SWAP_ONLY_SEPOLIA";

type Log = { t: number; m: string };
const push = (setLogs: (f: (p: Log[]) => Log[]) => void, m: string) =>
  setLogs((prev) => [{ t: Date.now(), m }, ...prev]);

export default function IntentPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [addr, setAddr] = useState<Address | "">("");
  const [l1Bal, setL1Bal] = useState<string>("-");
  const [l2Bal, setL2Bal] = useState<string>("-");
  const [baseBal, setBaseBal] = useState<string>("-");
  const [connecting, setConnecting] = useState(false);
  const [running, setRunning] = useState(false);
  const lock = useRef(createLock());

  const [command, setCommand] = useState("");
  const [mode, setMode] = useState<Mode>("L1_TO_L2");
  const [swapDirection, setSwapDirection] =
    useState<SwapDirection>("USDC_TO_ETH");
  const [autoDepositAfterSwap, setAutoDepositAfterSwap] = useState(false);
  const [useCommand, setUseCommand] = useState(false);
  const [intent, setIntent] = useState({
    amountEth: "0.001",
    amountUsdc: "1",
    to: "",
    constraints: { deadline_sec: 300 as number | undefined },
  });

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      push(setLogs, "🔎 Detecting wallet…");
      const account = await connectWallet();
      setAddr(account);
      push(setLogs, `🔗 Connected: ${account}`);
      try {
        await ensureChain(ADD_SEPOLIA.chainId, ADD_SEPOLIA);
      } catch {}
      try {
        await ensureChain(ADD_GIWA.chainId, ADD_GIWA);
      } catch {}
      try {
        await ensureChain(ADD_BASE.chainId, ADD_BASE);
      } catch {}
      await refreshBalances(account);
    } catch (e: any) {
      push(setLogs, `❌ Connect error: ${e.message || e}`);
    } finally {
      setConnecting(false);
    }
  };

  const refreshBalances = async (who?: string) => {
    const _who = (who || (addr as string)) as `0x${string}`;
    if (!_who) return;
    const l1 = makePublicL1();
    const l2 = makePublicL2();
    const b2 = makePublicBaseL2();
    const [bL1, bL2, bBase] = await Promise.all([
      l1.getBalance({ address: _who }),
      l2.getBalance({ address: _who }),
      b2.getBalance({ address: _who }),
    ]);
    setL1Bal(formatEther(bL1));
    setL2Bal(formatEther(bL2));
    setBaseBal(formatEther(bBase));
  };

  useEffect(() => {}, []);

  const compiled = useMemo(() => {
    const to = isAddress(intent.to) ? (intent.to as Address) : (addr as Address);
    const okAmt =
      mode === "SWAP_ONLY_SEPOLIA" ||
      mode === "PIPELINE_3R_USDCBASE_TO_ETHGIWA"
        ? isNum(intent.amountUsdc) || isNum(intent.amountEth)
        : isNum(intent.amountEth);

    const route: string[] = (() => {
      if (mode === "PIPELINE_3R_USDCBASE_TO_ETHGIWA") {
        return [
          "CCTP:USDC Base→Sepolia",
          "CustomPool:USDC→ETH (Sepolia)",
          "OP:Sepolia→GIWA (ETH)",
        ];
        }
      if (mode === "SWAP_ONLY_SEPOLIA") {
        const arr =
          swapDirection === "USDC_TO_ETH"
            ? ["CustomPool:USDC→ETH (Sepolia)"]
            : ["CustomPool:ETH→USDC (Sepolia)"];
        if (autoDepositAfterSwap && swapDirection === "USDC_TO_ETH") {
          arr.push("OP:Sepolia→GIWA (ETH)");
        }
        return arr;
      }
      if (mode === "L1_TO_L2") return ["OP:Sepolia→GIWA (ETH)"];
      return ["OP:GIWA→Sepolia (ETH)"];
    })();

    return {
      json: {
        mode,
        ...(mode === "SWAP_ONLY_SEPOLIA" ? { swapDirection } : {}),
        to: to || "",
        amountEth: intent.amountEth,
        amountUsdc: intent.amountUsdc,
        route,
      },
      ok: !!addr && okAmt,
      to,
    };
  }, [mode, swapDirection, autoDepositAfterSwap, intent, addr]);

  const applyCommand = () => {
    const raw = (command || "").trim();
    if (!raw) {
      push(setLogs, "⚠️ Empty command");
      return;
    }
    const s = normalizeCmd(raw);
    const amt = firstNumberStr(s);

    if (
      (hasWord(s, "usdc") && hasWord(s, "base") && hasWord(s, "giwa")) ||
      includesPhrase(s, "usdc base to giwa") ||
      includesPhrase(s, "usdc base to eth giwa")
    ) {
      setMode("PIPELINE_3R_USDCBASE_TO_ETHGIWA");
      setSwapDirection("USDC_TO_ETH");
      setAutoDepositAfterSwap(false);
      if (amt) setIntent((p) => ({ ...p, amountUsdc: amt }));
      setUseCommand(true);
      push(
        setLogs,
        `🧭 Parsed → PIPELINE (USDC Base→USDC Sepolia→Swap→Deposit), amountUsdc=${amt ?? "(default)"}`
      );
      return;
    }

    if (
      (includesPhrase(s, "usdc sepolia to giwa") ||
        includesPhrase(s, "usdc to giwa")) &&
      /\b-?\s*router\b/i.test(s)
    ) {
      setMode("SWAP_ONLY_SEPOLIA");
      setSwapDirection("USDC_TO_ETH");
      setAutoDepositAfterSwap(true);
      if (amt) setIntent((p) => ({ ...p, amountUsdc: amt }));
      setUseCommand(true);
      push(
        setLogs,
        `🧭 Parsed → SWAP_ONLY (USDC→ETH) + auto-deposit, amountUsdc=${amt ?? "(default)"}`
      );
      return;
    }

    if (hasWord(s, "to") && hasWord(s, "giwa") && !hasWord(s, "usdc")) {
      setMode("L1_TO_L2");
      setAutoDepositAfterSwap(false);
      if (amt) setIntent((p) => ({ ...p, amountEth: amt }));
      setUseCommand(true);
      push(setLogs, `🧭 Parsed → DEPOSIT (Sepolia→GIWA), amountEth=${amt ?? "(default)"}`);
      return;
    }

    if (/swap/.test(s) && hasWord(s, "sepolia") && hasWord(s, "eth") && hasWord(s, "usdc")) {
      if (includesPhrase(s, "eth swap usdc")) {
        setMode("SWAP_ONLY_SEPOLIA");
        setSwapDirection("ETH_TO_USDC");
        setAutoDepositAfterSwap(false);
        if (amt) setIntent((p) => ({ ...p, amountEth: amt }));
        setUseCommand(true);
        push(setLogs, `🧭 Parsed → SWAP_ONLY (ETH→USDC), amountEth=${amt ?? "(default)"}`);
        return;
      }
      if (includesPhrase(s, "usdc swap eth")) {
        setMode("SWAP_ONLY_SEPOLIA");
        setSwapDirection("USDC_TO_ETH");
        setAutoDepositAfterSwap(false);
        if (amt) setIntent((p) => ({ ...p, amountUsdc: amt }));
        setUseCommand(true);
        push(setLogs, `🧭 Parsed → SWAP_ONLY (USDC→ETH), amountUsdc=${amt ?? "(default)"}`);
        return;
      }
    }

    if (/^swap\b/i.test(s) && hasWord(s, "to")) {
      if (includesPhrase(s, "usdc to eth")) {
        setMode("SWAP_ONLY_SEPOLIA");
        setSwapDirection("USDC_TO_ETH");
        setAutoDepositAfterSwap(false);
        if (amt) setIntent((p) => ({ ...p, amountUsdc: amt }));
        setUseCommand(true);
        push(setLogs, `🧭 Parsed → SWAP_ONLY (USDC→ETH), amountUsdc=${amt ?? "(default)"}`);
        return;
      }
      if (includesPhrase(s, "eth to usdc")) {
        setMode("SWAP_ONLY_SEPOLIA");
        setSwapDirection("ETH_TO_USDC");
        setAutoDepositAfterSwap(false);
        if (amt) setIntent((p) => ({ ...p, amountEth: amt }));
        setUseCommand(true);
        push(setLogs, `🧭 Parsed → SWAP_ONLY (ETH→USDC), amountEth=${amt ?? "(default)"}`);
        return;
      }
    }

    if (/^withdraw\b/i.test(s) && hasWord(s, "eth")) {
      setMode("L2_TO_L1");
      setAutoDepositAfterSwap(false);
      if (amt) setIntent((p) => ({ ...p, amountEth: amt }));
      setUseCommand(true);
      push(setLogs, `🧭 Parsed → WITHDRAW (GIWA→Sepolia), amountEth=${amt ?? "(default)"}`);
      return;
    }
    if (includesPhrase(s, "giwa to sepolia")) {
      setMode("L2_TO_L1");
      setAutoDepositAfterSwap(false);
      setUseCommand(true);
      push(setLogs, "🧭 Parsed → WITHDRAW (GIWA→Sepolia) — will wait prove/finalize window");
      return;
    }

    if (amt && includesPhrase(s, `${amt} to giwa`)) {
      setMode("L1_TO_L2");
      setAutoDepositAfterSwap(false);
      setIntent((p) => ({ ...p, amountEth: amt }));
      setUseCommand(true);
      push(setLogs, `🧭 Parsed → DEPOSIT (shorthand), amountEth=${amt}`);
      return;
    }

    push(
      setLogs,
      "⚠️ Cannot parse. Examples below the command box."
    );
  };

  async function runDeposit() {
    if (!addr) throw new Error("Wallet not connected");
    const to = (isAddress(intent.to) ? (intent.to as Address) : addr) as Address;

    await ensureChain(ADD_SEPOLIA.chainId, ADD_SEPOLIA);
    push(setLogs, "🔁 Switched to Sepolia");

    const publicL1 = makePublicL1();
    const publicL2 = makePublicL2();
    const walletL1 = await makeWalletL1(addr as Address);

    const amt = parseEther(String(intent.amountEth));
    const depositArgs = await publicL2.buildDepositTransaction({
      mint: amt,
      to,
    });
    push(setLogs, "🧱 Built deposit args");

    const txHash = await walletL1.depositTransaction({
      ...depositArgs,
      account: addr,
    });
    push(setLogs, `🚀 L1 deposit sent: ${txHash}`);

    const receipt = await publicL1.waitForTransactionReceipt({ hash: txHash });
    push(setLogs, `✅ L1 confirmed in block ${receipt.blockNumber}`);

    const [l2Hash] = getL2TransactionHashes(receipt);
    push(setLogs, `🔗 L2 hash: ${l2Hash}`);

    push(setLogs, `⏳ Waiting L2 execution...`);
    const l2rc = await publicL2.waitForTransactionReceipt({ hash: l2Hash });
    push(setLogs, `🌟 L2 confirmed in block ${l2rc.blockNumber}`);
    await refreshBalances();
  }

  async function runWithdraw() {
    if (!addr) throw new Error("Wallet not connected");
    const to = (isAddress(intent.to) ? (intent.to as Address) : addr) as Address;

    await ensureChain(ADD_GIWA.chainId, ADD_GIWA);
    push(setLogs, "🔁 Switched to GIWA");

    const publicL1 = makePublicL1();
    const publicL2 = makePublicL2();
    const walletL1 = await makeWalletL1(addr as Address);
    const walletL2 = await makeWalletL2(addr as Address);

    const amt = parseEther(String(intent.amountEth));
    const withdrawalArgs = await publicL1.buildInitiateWithdrawal({
      to,
      value: amt,
    });
    push(setLogs, "🧱 Built withdrawal args");

    const wtx = await walletL2.initiateWithdrawal({
      ...withdrawalArgs,
      account: addr,
    });
    push(setLogs, `🚀 L2 withdrawal sent: ${wtx}`);

    const wrc = await publicL2.waitForTransactionReceipt({ hash: wtx });
    push(setLogs, `✅ L2 confirmed in block ${wrc.blockNumber}`);

    push(setLogs, "⏳ Waiting eligible to prove on L1...");
    const { output, withdrawal } = await publicL1.waitToProve({
      receipt: wrc,
      targetChain: walletL2.chain as any,
    });
    push(setLogs, "📄 Ready to prove on L1");

    await ensureChain(ADD_SEPOLIA.chainId, ADD_SEPOLIA);
    const proveArgs = await publicL2.buildProveWithdrawal({ output, withdrawal });
    const proveTx = await (walletL1 as any).proveWithdrawal({
      ...(proveArgs as any),
      account: addr,
      targetChain: walletL2.chain as any,
    });
    push(setLogs, `🧾 Prove tx on L1: ${proveTx}`);
    await publicL1.waitForTransactionReceipt({ hash: proveTx });
    push(setLogs, "✅ Proved on L1");

    push(setLogs, "⏳ Waiting to finalize (challenge window)...");
    await publicL1.waitToFinalize({
      targetChain: walletL2.chain as any,
      withdrawalHash: withdrawal.withdrawalHash,
    });

    const finalizeTx = await (walletL1 as any).finalizeWithdrawal({
      targetChain: walletL2.chain as any,
      withdrawal,
      account: addr,
    });
    push(setLogs, `🏁 Finalize tx on L1: ${finalizeTx}`);
    await publicL1.waitForTransactionReceipt({ hash: finalizeTx });
    push(setLogs, "🎉 Withdrawal finalized!");
    await refreshBalances();
  }

  async function depositDeltaToGiwa(deltaWei: bigint) {
    if (deltaWei <= 0n) throw new Error("ETH delta is not positive");
    const publicL1 = makePublicL1();
    const publicL2 = makePublicL2();

    await ensureChain(ADD_SEPOLIA.chainId, ADD_SEPOLIA);
    const l1Bal = await publicL1.getBalance({ address: addr as Address });
    const gasReserve = parseEther("0.0005");

    let mint = deltaWei;
    if (mint + gasReserve > l1Bal) {
      const cap = l1Bal > gasReserve ? l1Bal - gasReserve : 0n;
      if (cap <= 0n) throw new Error("Not enough L1 balance for deposit + gas.");
      push(setLogs, `⚖️ Cap deposit from ${formatEther(mint)} → ${formatEther(cap)} ETH`);
      mint = cap;
    }

    const walletL1 = await makeWalletL1(addr as Address);
    const depositArgs = await publicL2.buildDepositTransaction({
      mint,
      to: addr as Address,
    });
    const txHash = await walletL1.depositTransaction({
      ...depositArgs,
      account: addr as Address,
    });
    push(setLogs, `🚀 Auto-deposit sent: ${txHash}`);
    const receipt = await publicL1.waitForTransactionReceipt({ hash: txHash });
    const [l2Hash] = getL2TransactionHashes(receipt);
    await publicL2.waitForTransactionReceipt({ hash: l2Hash });
    push(setLogs, "🌟 Auto-deposit confirmed on L2");
  }

  async function runPipeline3Routers() {
    if (!addr) throw new Error("Wallet not connected");
    await pipeline_3routers_baseUsdc_to_giwaEth({
      account: addr as Address,
      usdcAmount: intent.amountUsdc,
      onLog: (m) => push(setLogs, m),
    });
    await refreshBalances();
  }

  async function runSwapOnlyHandler() {
    if (!addr) throw new Error("Wallet not connected");

    const to = (isAddress(intent.to) ? (intent.to as Address) : (addr as Address)) as Address;

    let preEth = 0n;
    const rpc =
      (process.env.NEXT_PUBLIC_RPC_SEPOLIA as any) || "https://sepolia.drpc.org";
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpc),
    });
    if (autoDepositAfterSwap && swapDirection === "USDC_TO_ETH") {
      preEth = await publicClient.getBalance({ address: addr as Address });
    }

    const amount =
      swapDirection === "USDC_TO_ETH" ? intent.amountUsdc : intent.amountEth;

    await runSwapOnly({
      account: addr as Address,
      direction: swapDirection,
      amount,
      to,
      minOut: 0n,
      onLog: (m) => push(setLogs, m),
    });

    if (autoDepositAfterSwap && swapDirection === "USDC_TO_ETH") {
      const postEth = await publicClient.getBalance({ address: addr as Address });
      const delta = postEth - preEth;
      push(setLogs, `🧮 Swap delta ≈ ${formatEther(delta)} ETH → auto-deposit`);
      await depositDeltaToGiwa(delta);
    }

    await refreshBalances();
  }

  const canRun = compiled.ok;
  const runIntent = async () => {
    await runSafely(async () => {
      if (mode === "L1_TO_L2") return runDeposit();
      if (mode === "L2_TO_L1") return runWithdraw();
      if (mode === "PIPELINE_3R_USDCBASE_TO_ETHGIWA") return runPipeline3Routers();
      return runSwapOnlyHandler();
    });
  };

  const runSafely = async (fn: () => Promise<void>) => {
    try {
      await lock.current.run(async () => {
        setRunning(true);
        await fn();
      });
    } catch (e: any) {
      push(setLogs, `❌ ${e.message || e}`);
    } finally {
      setRunning(false);
    }
  };

  const amountLabel =
    mode === "SWAP_ONLY_SEPOLIA"
      ? swapDirection === "USDC_TO_ETH"
        ? "Amount "
        : "Amount "
      : mode === "PIPELINE_3R_USDCBASE_TO_ETHGIWA"
      ? "Amount "
      : "Amount ";
  const amountValue =
    mode === "SWAP_ONLY_SEPOLIA"
      ? swapDirection === "USDC_TO_ETH"
        ? intent.amountUsdc
        : intent.amountEth
      : mode === "PIPELINE_3R_USDCBASE_TO_ETHGIWA"
      ? intent.amountUsdc
      : intent.amountEth;

  const onAmountChange = (v: string) => {
    if (mode === "SWAP_ONLY_SEPOLIA") {
      if (swapDirection === "USDC_TO_ETH") {
        setIntent({ ...intent, amountUsdc: v });
      } else {
        setIntent({ ...intent, amountEth: v });
      }
    } else if (mode === "PIPELINE_3R_USDCBASE_TO_ETHGIWA") {
      setIntent({ ...intent, amountUsdc: v });
    } else {
      setIntent({ ...intent, amountEth: v });
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Intent Runner</h2>

        <div className="grid" style={{ gap: 8, marginBottom: 10 }}>
          <div>
            <label className="small">Typed intent (command)</label>
            <input
              className="input"
              placeholder="e.g., 1 usdc base to giwa"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
            <div className="small mono" style={{ opacity: 0.8, marginTop: 6, lineHeight: 1.5 }}>
              <div>Examples:</div>
              <div>• bridge/swap</div>
              <div>  &lt;amt&gt; usdc base to giwa</div>
              <div>  &lt;amt&gt; eth sepolia to giwa</div>
              <div>  &lt;amt&gt; eth swap usdc = sepolia</div>
              <div>  &lt;amt&gt; usdc swap eth = sepolia</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <button className="btn" onClick={applyCommand}>Parse</button>
            {mode === "SWAP_ONLY_SEPOLIA" && swapDirection === "USDC_TO_ETH" ? (
              <label className="small" style={{ display: "flex", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={autoDepositAfterSwap}
                  onChange={(e) => setAutoDepositAfterSwap(e.target.checked)}
                />
                Auto-deposit to GIWA after swap
              </label>
            ) : null}
            {useCommand ? (
              <span className="small" style={{ opacity: 0.7 }}>
                (mode set by command)
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-2">
          <div>
            <label className="small">Mode</label>
            <select
              className="input"
              value={mode}
              onChange={(e) => {
                setUseCommand(false);
                setMode(e.target.value as Mode);
              }}
              disabled={running}
            >
              <option value="L1_TO_L2">Deposit: Ethereum Sepolia → GIWA (ETH)</option>
              <option value="L2_TO_L1">Withdraw: GIWA → Ethereum Sepolia (ETH)</option>
              <option value="PIPELINE_3R_USDCBASE_TO_ETHGIWA">
                Pipeline (3 Router): USDC Base → USDC Sepolia → swap → ETH GIWA
              </option>
              <option value="SWAP_ONLY_SEPOLIA">Swap Only (Sepolia)</option>
            </select>
          </div>

          {mode === "SWAP_ONLY_SEPOLIA" && (
            <div>
              <label className="small">Swap Direction</label>
              <select
                className="input"
                value={swapDirection}
                onChange={(e) => {
                  setUseCommand(false);
                  setSwapDirection(e.target.value as SwapDirection);
                }}
                disabled={running}
              >
                <option value="USDC_TO_ETH">USDC → ETH</option>
                <option value="ETH_TO_USDC">ETH → USDC</option>
              </select>
            </div>
          )}

          <div>
            <label className="small">{amountLabel}</label>
            <input
              className="input"
              value={amountValue}
              onChange={(e) => onAmountChange(e.target.value)}
              disabled={running}
            />
          </div>

          <div>
            <label className="small">Recipient (optional)</label>
            <input
              className="input"
              placeholder="0x... (default: sender)"
              value={intent.to || ""}
              onChange={(e) => setIntent({ ...intent, to: e.target.value })}
              disabled={running}
            />
          </div>

          <div>
            <label className="small">Deadline (sec, optional)</label>
            <input
              className="input"
              type="number"
              placeholder="300"
              value={intent.constraints?.deadline_sec || ""}
              onChange={(e) =>
                setIntent({
                  ...intent,
                  constraints: {
                    ...intent.constraints,
                    deadline_sec: Number(e.target.value || 0) || undefined,
                  },
                })
              }
              disabled={running}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small">Compiled Intent JSON</div>
          <pre
            className="mono"
            style={{
              whiteSpace: "pre-wrap",
              background: "#00000033",
              border: "1px solid #ffffff22",
              borderRadius: 10,
              padding: 10,
            }}
          >
            {JSON.stringify(compiled.json, null, 2)}
          </pre>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => connect()} disabled={connecting || running}>
            {connecting ? "Connecting…" : "Connect"}
          </button>

          <button className="btn" disabled={!canRun || running} onClick={runIntent}>
            {running ? "Working…" : "Execute Intent"}
          </button>

          <button className="btn" onClick={() => refreshBalances()} disabled={running}>
            Refresh Balances
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Wallet</h3>
        <div className="grid grid-2">
          <div>
            <div className="small">Address</div>
            <div className="mono">{addr || "-"}</div>
          </div>
          <div>
            <div className="small">Sepolia Balance</div>
            <div className="mono">{l1Bal} ETH</div>
          </div>
          <div>
            <div className="small">GIWA Balance</div>
            <div className="mono">{l2Bal} ETH</div>
          </div>
          <div>
            <div className="small">Base Sepolia Balance</div>
            <div className="mono">{baseBal} ETH</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Logs</h3>
        <div className="mono small" style={{ whiteSpace: "pre-wrap" }}>
          {logs.map((l) => `[${new Date(l.t).toLocaleTimeString()}] ${l.m}`).join("\n")}
        </div>
      </div>
    </div>
  );
}
