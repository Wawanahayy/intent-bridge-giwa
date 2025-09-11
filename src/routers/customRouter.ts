// @ts-check
'use client';

import type { Address } from 'viem';
import {
  createPublicClient, createWalletClient, custom, http, parseUnits
} from 'viem';
import { sepolia } from 'viem/chains';

const pick = (k: string, alts: string[] = [], dflt = '') => {
  const v = (process.env as any)[k] as string | undefined;
  if (v) return v;
  for (const a of alts) {
    const vv = (process.env as any)[a] as string | undefined;
    if (vv) return vv;
  }
  return dflt;
};
const RPC_SEPOLIA = pick('NEXT_PUBLIC_RPC_SEPOLIA', ['NEXT_PUBLIC_RPC'], 'https://1rpc.io/sepolia');
const USDC        = (pick('NEXT_PUBLIC_USDC_SEPOLIA', ['NEXT_PUBLIC_USDC'], '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238') || '') as `0x${string}`;
const ROUTER      = (pick('NEXT_PUBLIC_CUSTOM_ROUTER_SEPOLIA', ['NEXT_PUBLIC_CUSTOM_ROUTER'], '0x6e34AE9C414aa726DbBAf98b1686CB8fe43b8EAb') || '') as `0x${string}`;

const CUSTOM_ROUTER_ABI = [
  {
    type: 'function',
    name: 'swapUSDCToETH',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn',     type: 'uint256' }, // USDC 6d
      { name: 'amountOutMin', type: 'uint256' }, // ETH wei
      { name: 'to',           type: 'address'  },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;


const ERC20_ABI = [
  { type:'function', name:'allowance', stateMutability:'view',
    inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}],
    outputs:[{type:'uint256'}] },
  { type:'function', name:'approve', stateMutability:'nonpayable',
    inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}],
    outputs:[{type:'bool'}] },
] as const;

const MAX_UINT = (2n**256n)-1n;

function mk() {
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_SEPOLIA) });
  const walletClient = createWalletClient({ chain: sepolia, transport: custom((window as any).ethereum) });
  return { publicClient, walletClient };
}

export async function swapUSDCToETH_viaCustom({
  account,
  usdcAmount,       
  minOutWei = 0n,    
  recipient,
  onLog,
}:{
  account: Address;
  usdcAmount: string;
  minOutWei?: bigint;
  recipient?: Address; // default account
  onLog?: (m:string)=>void;
}): Promise<bigint> {
  const to = (recipient ?? account) as Address;
  const { publicClient, walletClient } = mk();

  
  try {
    const id = await walletClient.getChainId();
    if (id !== sepolia.id) await walletClient.switchChain({ id: sepolia.id });
  } catch { /* ignore */ }

  const amountIn = parseUnits(String(usdcAmount), 6);

  const allowance: bigint = await publicClient.readContract({
    address: USDC, abi: ERC20_ABI, functionName: 'allowance', args: [account, ROUTER],
  });
  if (allowance < amountIn) {
    onLog?.(`🔏 Approve USDC -> custom router (${ROUTER})…`);
    const txA = await walletClient.writeContract({
      address: USDC, abi: ERC20_ABI, functionName: 'approve', args: [ROUTER, MAX_UINT], account,
    });
    await publicClient.waitForTransactionReceipt({ hash: txA });
  }


  const preEth = await publicClient.getBalance({ address: to });


  onLog?.(`🔁 swapUSDCToETH(amountIn=${usdcAmount} USDC, minOut=${minOutWei} wei)…`);
  const hash = await walletClient.writeContract({
    address: ROUTER,
    abi: CUSTOM_ROUTER_ABI,
    functionName: 'swapUSDCToETH',
    args: [amountIn, minOutWei, to],
    account,
  });
  const rc = await publicClient.waitForTransactionReceipt({ hash });


  const postEth = await publicClient.getBalance({ address: to });
  let received: bigint = postEth - preEth;

  if (to.toLowerCase() === account.toLowerCase()) {
    // Pastikan gasUsed & effectiveGasPrice bertipe bigint
    const gu: bigint =
      typeof (rc as any).gasUsed === 'bigint' ? (rc as any).gasUsed : BigInt((rc as any).gasUsed ?? 0);
    const egp: bigint =
      typeof (rc as any).effectiveGasPrice === 'bigint' ? (rc as any).effectiveGasPrice : BigInt((rc as any).effectiveGasPrice ?? 0);
    const gasCost = gu * egp;
    received = received + gasCost;
  }

  if (received <= 0n) throw new Error('Swap produced zero ETH');
  onLog?.(`✅ Custom swap out: ${received.toString()} wei`);
  return received;
}
