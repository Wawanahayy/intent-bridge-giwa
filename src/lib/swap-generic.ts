// src/lib/swap-generic.ts
'use client';

import type { Address } from 'viem';
import { createPublicClient, createWalletClient, custom, http, parseUnits, defineChain } from 'viem';


const pick = (k: string, alts: string[] = [], dflt = '') => {
  const v = (process.env as any)[k] as string | undefined;
  if (v) return v;
  for (const a of alts) {
    const vv = (process.env as any)[a] as string | undefined;
    if (vv) return vv;
  }
  return dflt;
};

const RPC_IRYS = pick('NEXT_PUBLIC_IRYS_RPC_URL');
const ROUTER   = pick('NEXT_PUBLIC_CUSTOM_ROUTER_IRYS') as `0x${string}`;
const USDC     = pick('NEXT_PUBLIC_USDC_IRYS') as `0x${string}`;

const irys = defineChain({
  id: 1270,
  name: 'Irys Testnet',
  nativeCurrency: { name: 'Irys', symbol: 'IRYS', decimals: 18 },
  rpcUrls: { default: { http: [RPC_IRYS] } },
  testnet: true,
});

const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve',   stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

const CUSTOM_ROUTER_ABI = [
  { type: 'function', name: 'swapUSDCToETH', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const MAX_UINT = (2n ** 256n) - 1n;

function mkClients() {
  return {
    publicClient: createPublicClient({ chain: irys, transport: http(RPC_IRYS) }),
    walletClient: createWalletClient({ chain: irys, transport: custom((window as any).ethereum) }),
  };
}

export async function swapUSDCToETH_viaCustom({
  account,
  usdcAmount,
  minOutWei = 1n,
  recipient,
  onLog,
}: {
  account: Address;
  usdcAmount: string;
  minOutWei?: bigint;
  recipient?: Address;
  onLog?: (m: string) => void;
}): Promise<`0x${string}`> {
  const { publicClient, walletClient } = mkClients();

  try {
    if ((await walletClient.getChainId()) !== irys.id) await walletClient.switchChain({ id: irys.id });
  } catch {}

  const amountIn = parseUnits(String(usdcAmount), 6);

  const allowance: bigint = await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account, ROUTER],
  });

  if (allowance < amountIn) {
    onLog?.(`🔏 Approve USDC -> custom router (${ROUTER})…`);
    const txA = await walletClient.writeContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [ROUTER, MAX_UINT],
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: txA });
    onLog?.('✅ Approve confirmed');
  }

  const to = (recipient ?? account) as Address;
  onLog?.(`🔁 swapUSDCToETH(amountIn=${usdcAmount} USDC, minOut=${minOutWei} wei)…`);
  const hash = await walletClient.writeContract({
    address: ROUTER,
    abi: CUSTOM_ROUTER_ABI,
    functionName: 'swapUSDCToETH',
    args: [amountIn, minOutWei, to],
    account,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  onLog?.(`✅ Done: ${hash}`);
  return hash;
}
