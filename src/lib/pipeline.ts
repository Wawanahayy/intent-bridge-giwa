"use client";

import { Address, formatEther, parseEther } from "viem";
import { ensureChain } from "@/lib/wallet";
import { ADD_BASE } from "@/lib/base";
import { makePublicL1, makePublicL2, makeWalletL1, getL2TransactionHashes } from "@/lib/giwa";
import { swapUSDCToETH_viaCustom } from "@/lib/swap";
import { cctpBurnOnBase, getMessageFromBurn, waitAttestation, receiveOnSepolia } from "@/routers/cctp";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const ADD_SEPOLIA = {
  chainId: "0xaa36a7",
  chainName: "Sepolia",
  rpcUrls: [process.env.NEXT_PUBLIC_RPC_SEPOLIA || "https://sepolia.drpc.org"],
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: ["https://sepolia.etherscan.io"]
};


async function depositEthSepoliaToGiwa({
  account, amount, onLog
}:{
  account: Address;
  amount: bigint; 
  onLog: (m:string)=>void;
}) {
  if (amount <= 0n) throw new Error("Deposit amount must be > 0");

  const publicL1 = makePublicL1();
  const publicL2 = makePublicL2();

  await ensureChain(ADD_SEPOLIA.chainId, ADD_SEPOLIA);
  onLog("🔁 Switched to Sepolia");

  const l1Bal = await publicL1.getBalance({ address: account });

  // buffer gas kecil untuk tx deposit
  const gasReserve = parseEther("0.0005");
  let mint = amount;

  if (mint + gasReserve > l1Bal) {
    const cap = l1Bal > gasReserve ? (l1Bal - gasReserve) : 0n;
    if (cap <= 0n) {
      onLog(`❌ L1 balance: ${formatEther(l1Bal)} ETH`);
      throw new Error("Saldo L1 tidak cukup untuk deposit + gas.");
    }
    onLog(`⚖️ Cap deposit dari ${formatEther(mint)} → ${formatEther(cap)} ETH`);
    mint = cap;
  }
  onLog(`💵 Mint (final): ${formatEther(mint)} ETH`);

  const walletL1 = await makeWalletL1(account);
  const depositArgs = await publicL2.buildDepositTransaction({ mint, to: account });
  onLog("🧱 Built deposit args");

  const txHash = await walletL1.depositTransaction({ ...depositArgs, account });
  onLog(`🚀 L1 deposit sent: ${txHash}`);

  const rc = await publicL1.waitForTransactionReceipt({ hash: txHash });
  if (rc.status !== "success") throw new Error(`Deposit L1→L2 revert (status=${rc.status}).`);
  onLog(`✅ L1 confirmed: #${rc.blockNumber}`);

  const [l2Hash] = getL2TransactionHashes(rc);
  onLog(`🔗 L2 hash: ${l2Hash}`);

  const l2rc = await publicL2.waitForTransactionReceipt({ hash: l2Hash });
  if (l2rc.status !== "success") throw new Error(`L2 deposit tx failed (status=${l2rc.status}).`);
  onLog(`🌟 GIWA confirmed: #${l2rc.blockNumber}`);
}

/** Pipeline: Base USDC -> CCTP -> USDC Sepolia -> custom swap -> deposit ETH ke GIWA */
export async function pipeline_3routers_baseUsdc_to_giwaEth({
  account, usdcAmount, deadlineSec, onLog
}:{
  account: Address;
  usdcAmount: string; 
  deadlineSec?: number; 
  onLog: (m:string)=>void;
}) {

  await ensureChain(ADD_BASE.chainId, ADD_BASE);
  onLog("🔁 Switched to Base Sepolia (USDC burn)");
  const burnTx = await cctpBurnOnBase({ account, amountUsdc: usdcAmount, recipientOnSepolia: account });
  onLog(`🔥 CCTP depositForBurn sent: ${burnTx}`);

  onLog("🧾 Reading burn receipt & message...");
  const { message, messageHash } = await getMessageFromBurn({ burnTxHash: burnTx });
  onLog(`📦 Message hash: ${messageHash}`);

  onLog("🌈 Waiting Circle attestation (auto)...");
  const att = await waitAttestation({ messageHash });
  onLog("🔏 Attestation ready");

  onLog("🪄 Calling receiveMessage on Sepolia...");
  await ensureChain(ADD_SEPOLIA.chainId, ADD_SEPOLIA);
  const rx = await receiveOnSepolia({ account, message, attestation: att });
  onLog(`✅ USDC minted (receiveMessage tx: ${rx})`);

  const rpc = (process.env.NEXT_PUBLIC_RPC_SEPOLIA as any) || 'https://sepolia.drpc.org';
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });

  const preEth = await publicClient.getBalance({ address: account });

  const r = await swapUSDCToETH_viaCustom({
    account,
    usdcAmount,
    minOutWei: 0n,
    recipient: account,
    onLog,
  });
  const hash = r.hash;

  const rc = await publicClient.waitForTransactionReceipt({ hash });
  const gasUsed  = typeof rc.gasUsed === 'bigint' ? rc.gasUsed : BigInt(rc.gasUsed ?? 0);
  const gasPrice = typeof rc.effectiveGasPrice === 'bigint' ? rc.effectiveGasPrice : BigInt(rc.effectiveGasPrice ?? 0);
  const gasCost  = gasUsed * gasPrice;

  const postEth = await publicClient.getBalance({ address: account });
  let received = postEth - preEth + gasCost; // kompensasi biaya gas swap

  if (received <= 0n) {
    onLog(`⚠️ Delta ETH non-positif (post=${formatEther(postEth)} / pre=${formatEther(preEth)} / gas=${formatEther(gasCost)})`);
    throw new Error("Swap tidak menghasilkan ETH (delta ≤ 0)");
  }

  onLog(`✅ Custom swap out (delta): ${formatEther(received)} ETH`);
  onLog(`➡️ Deposit to GIWA: target ${formatEther(received)} ETH (akan di-cap jika perlu)`);

  // 3) Deposit ETH ke GIWA (auto-cap agar tidak kehabisan gas)
  await depositEthSepoliaToGiwa({ account, amount: received, onLog });
}

export function compilePipelineIntentPreview({
  account, usdcAmount, to, deadlineSec = 300,
}:{
  account: Address;
  usdcAmount: string;
  to?: Address;
  deadlineSec?: number;
}) {
  return {
    mode: "PIPELINE_3R_USDCBASE_TO_ETHGIWA",
    to: (to ?? account),
    amountUsdc: usdcAmount,
    deadlineSec,
    route: [
      "CCTP:USDC Base→Sepolia",
      "CustomPool:USDC→ETH (Sepolia)",
      "OP:Sepolia→GIWA (ETH)",
    ],
  };
}
