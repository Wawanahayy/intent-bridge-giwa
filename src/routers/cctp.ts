// @ts-check
'use client';

import type { Address, Hex } from 'viem';
import { keccak256, decodeEventLog } from 'viem';
import { makeWalletBaseL2, makePublicBaseL2, ADD_BASE } from '@/lib/base';
import { makePublicL1, makeWalletL1 } from '@/lib/giwa';
import { ensureChain } from '@/lib/wallet';

const ERC20_ABI = [
  { type:"function", name:"decimals",  stateMutability:"view",       inputs:[], outputs:[{type:"uint8"}] },
  { type:"function", name:"allowance", stateMutability:"view",       inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", name:"approve",   stateMutability:"nonpayable", inputs:[{name:"spender",type:"address"},{name:"value",type:"uint256"}],  outputs:[{type:"bool"}] },
] as const;

const TOKEN_MESSENGER_ABI = [
  {
    type:"function", name:"depositForBurn", stateMutability:"nonpayable",
    inputs:[
      {name:"amount",             type:"uint256"},
      {name:"destinationDomain",  type:"uint32"},
      {name:"mintRecipient",      type:"bytes32"},
      {name:"burnToken",          type:"address"}
    ],
    outputs:[]
  }
] as const;

const MESSAGE_TRANSMITTER_ABI = [
  { type:"function", name:"receiveMessage", stateMutability:"nonpayable",
    inputs:[{ name:"message", type:"bytes" },{ name:"attestation", type:"bytes" }], outputs:[{ type:"bool" }] },
  { type:"event",   name:"MessageSent", inputs:[{ indexed:false, name:"message", type:"bytes" }] }
] as const;

export async function cctpBurnOnBase({
  account, amountUsdc, recipientOnSepolia
}:{ account: Address; amountUsdc: string; recipientOnSepolia: Address; }) {
  const TOKEN_MESSENGER = process.env.NEXT_PUBLIC_CCTP_TOKEN_MESSENGER! as `0x${string}`;
  const USDC_BASE       = process.env.NEXT_PUBLIC_USDC_BASE! as `0x${string}`;
  const CCTP_DOMAIN_SEPOLIA = Number(process.env.NEXT_PUBLIC_CCTP_DOMAIN_SEPOLIA || "0");

  await ensureChain(ADD_BASE.chainId, ADD_BASE);
  const wallet  = await makeWalletBaseL2(account);
  const pubBase = makePublicBaseL2();

  const { parseUnits, padHex } = await import("viem");
  const amt = parseUnits(String(amountUsdc), 6);

  const allowance: bigint = await pubBase.readContract({
    address: USDC_BASE, abi: ERC20_ABI, functionName: "allowance", args: [account, TOKEN_MESSENGER]
  }) as unknown as bigint;

  if (allowance < amt) {
    const txApprove = await wallet.writeContract({
      address: USDC_BASE, abi: ERC20_ABI, functionName: "approve", args: [TOKEN_MESSENGER, amt], account
    });
    await pubBase.waitForTransactionReceipt({ hash: txApprove as `0x${string}` });
  }

  const mintRecipientBytes32: Hex = padHex(recipientOnSepolia, { size: 32 });
  const burnTx = await wallet.writeContract({
    address: TOKEN_MESSENGER, abi: TOKEN_MESSENGER_ABI, functionName: "depositForBurn",
    args: [amt, CCTP_DOMAIN_SEPOLIA, mintRecipientBytes32, USDC_BASE], account
  });

  return burnTx as `0x${string}`;
}

export async function getMessageFromBurn({ burnTxHash }:{ burnTxHash: `0x${string}` }) {
  const pubBase = makePublicBaseL2();
  const rc = await pubBase.waitForTransactionReceipt({ hash: burnTxHash });

  for (const log of rc.logs) {
    try {
      const topics = [...(log.topics as readonly Hex[])] as [Hex, ...Hex[]];

      const decoded = decodeEventLog({
        abi: MESSAGE_TRANSMITTER_ABI,
        data: log.data as Hex,
        topics,
      });

      if (decoded.eventName === "MessageSent") {
        const argsAny: any = (decoded as any).args;
        const msgBytes: Hex = (Array.isArray(argsAny) ? argsAny[0] : argsAny.message) as Hex;
        const messageHash = keccak256(msgBytes);
        return { message: msgBytes as `0x${string}`, messageHash };
      }
    } catch {
      // skip log non-kecocokan
    }
  }
  throw new Error("MessageSent event not found in burn receipt");
}

export async function waitAttestation({ messageHash, onTick }:{
  messageHash: `0x${string}`;
  onTick?:(sec:number)=>void;
}) {
  const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
  let sec = 0;
  for (;;) {
    try {
      const base =
        process.env.NEXT_PUBLIC_CCTP_ATTESTATION_BASE_URL ||
        "https://iris-api-sandbox.circle.com/v1/attestations/";
      const res = await fetch(`${base}${messageHash}`, { cache: "no-store" });
      const j = await res.json();
      const att: string | undefined =
        j?.attestation || j?.attestationSignature || j?.data?.attestation;
      if (att && /^0x[0-9a-fA-F]+$/.test(att)) return att as `0x${string}`;
    } catch {}
    await sleep(5000); sec += 5; onTick?.(sec);
  }
}

export async function receiveOnSepolia({
  account, message, attestation
}:{ account: Address; message: `0x${string}`; attestation: `0x${string}`; }) {
  const MESSAGE_TRANSMITTER = process.env.NEXT_PUBLIC_CCTP_MESSAGE_TRANSMITTER! as `0x${string}`;
  const pubL1    = makePublicL1();
  const walletL1 = await makeWalletL1(account);

  const tx = await walletL1.writeContract({
    address: MESSAGE_TRANSMITTER,
    abi: MESSAGE_TRANSMITTER_ABI,
    functionName: "receiveMessage",
    args: [message, attestation],
    account
  });
  await pubL1.waitForTransactionReceipt({ hash: tx as `0x${string}` });
  return tx as `0x${string}`;
}
