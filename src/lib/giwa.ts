"use client";

import {
  defineChain, createPublicClient, createWalletClient, http, custom, type Chain, type Address
} from "viem";
import { sepolia } from "viem/chains";
import {
  publicActionsL1, publicActionsL2, walletActionsL1, walletActionsL2,
  getL2TransactionHashes
} from "viem/op-stack";

export const giwaSepolia: Chain = defineChain({
  id: 91342,
  name: "Giwa Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_GIWA || "https://sepolia-rpc.giwa.io"] } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
    l2OutputOracle: {},
    disputeGameFactory: { [sepolia.id]: { address: "0x37347caB2afaa49B776372279143D71ad1f354F6" } },
    portal: { [sepolia.id]: { address: "0x956962C34687A954e611A83619ABaA37Ce6bC78A" } },
    l1StandardBridge: { [sepolia.id]: { address: "0x77b2ffc0F57598cAe1DB76cb398059cF5d10A7E7" } }
  },
  testnet: true
});

export function makePublicL1(){
  const rpc = process.env.NEXT_PUBLIC_RPC_SEPOLIA || "https://sepolia.drpc.org";
  return createPublicClient({ chain: sepolia, transport: http(rpc) }).extend(publicActionsL1());
}
export function makePublicL2(){
  const rpc = process.env.NEXT_PUBLIC_RPC_GIWA || "https://sepolia-rpc.giwa.io";
  return createPublicClient({ chain: giwaSepolia, transport: http(rpc) }).extend(publicActionsL2());
}
export async function makeWalletL1(account?: Address){
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");
  return createWalletClient({ chain: sepolia, transport: custom(eth), account }).extend(walletActionsL1());
}
export async function makeWalletL2(account?: Address){
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");
  return createWalletClient({ chain: giwaSepolia, transport: custom(eth), account }).extend(walletActionsL2());
}

export { getL2TransactionHashes };
