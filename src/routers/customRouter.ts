// src/routers/customRouter.ts
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


const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve',   stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

const CUSTOM_ROUTER_ABI = [
  { type: 'function', name: 'swapUSDCToETH', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'swapETHToUSDC', stateMutability: 'payable',    inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;


const irys = defineChain({
  id: 1270,
  name: 'Irys Testnet',
  nativeCurrency: { name: 'Irys', symbol: 'IRYS', decimals: 18 },
  rpcUrls: { default: { http: [RPC_IRYS] } },
  testnet: true,
});


const MAX_UINT = (2n ** 256n) - 1n;

function mkClients() {
  return {
    publicClient: createPublicClient({ chain: irys, transport: http(RPC_IRYS) }),
    walletClient: createWalletClient({ chain: irys, transport: custom((window as any).ethereum) }),
  };
}


export async function approveUSDCIfNeeded({
  owner,
  spender = ROUTER,
  needAmount,
  onLog,
}: {
  owner: Address;
  spender?: Address;
  needAmount: bigint;
  onLog?: (m: string) => void;
}) {
  const { publicClient, walletClient } = mkClients();

  const allowed = (await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  })) as bigint;

  if (allowed >= needAmount) return;

  onLog?.(`🔏 Approving USDC to ${spender} (amount=${needAmount})…`);
  const tx = await walletClient.writeContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, MAX_UINT], // atau gunakan needAmount kalau mau exact
    account: owner,
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  onLog?.('✅ Approve confirmed');
}

export async function swapUSDCtoETH_Custom({
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
}) {
  const { publicClient, walletClient } = mkClients();

  try {
    if ((await walletClient.getChainId()) !== irys.id) await walletClient.switchChain({ id: irys.id });
  } catch {}

  const amtIn = parseUnits(usdcAmount, 6);
  await approveUSDCIfNeeded({ owner: account, needAmount: amtIn, onLog });

  const to = (recipient ?? account) as Address;
  onLog?.('🧪 swapUSDCToETH via CustomRouter');
  const hash = await walletClient.writeContract({
    address: ROUTER,
    abi: CUSTOM_ROUTER_ABI,
    functionName: 'swapUSDCToETH',
    args: [amtIn, minOutWei, to],
    account,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  onLog?.(`✅ Done: ${hash}`);
  return hash;
}
