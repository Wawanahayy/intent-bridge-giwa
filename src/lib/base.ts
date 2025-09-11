"use client";
import {
  createPublicClient, createWalletClient, custom, http
} from "viem";
import { baseSepolia } from "viem/chains";
import { publicActionsL2, walletActionsL2 } from "viem/op-stack";

export function makePublicBaseL2() {
  const rpc = process.env.NEXT_PUBLIC_RPC_BASE || "https://sepolia.base.org";
  return createPublicClient({ chain: baseSepolia, transport: http(rpc) })
    .extend(publicActionsL2());
}

export async function makeWalletBaseL2(account?: `0x${string}`) {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");
  return createWalletClient({
    chain: baseSepolia,
    transport: custom(eth),
    account
  }).extend(walletActionsL2());
}

export const ADD_BASE = {
  chainId: "0x14a34", // 84532
  chainName: "Base Sepolia",
  rpcUrls: [process.env.NEXT_PUBLIC_RPC_BASE || "https://sepolia.base.org"],
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: ["https://sepolia.basescan.org"]
};
