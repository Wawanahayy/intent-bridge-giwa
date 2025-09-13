'use client';

import {
  createPublicClient, createWalletClient, http, custom,
  parseUnits, parseEther, type Address
} from 'viem';
import { getRpcUrlFor, getRouterFor, getUsdcFor, type ChainKey } from './addr';
import { getIrysChain } from './chain';

const ERC20_ABI = [
  { type:'function', name:'decimals',  stateMutability:'view', inputs:[], outputs:[{type:'uint8'}] },
  { type:'function', name:'allowance', stateMutability:'view', inputs:[{type:'address'},{type:'address'}], outputs:[{type:'uint256'}] },
  { type:'function', name:'approve',   stateMutability:'nonpayable', inputs:[{type:'address'},{type:'uint256'}], outputs:[{type:'bool'}] },
] as const;

const CUSTOM_ROUTER_ABI = [
  {
    type:'function', name:'swapUSDCToETH', stateMutability:'nonpayable',
    inputs:[{type:'uint256'},{type:'uint256'},{type:'address'}], outputs:[{type:'uint256'}]
  },
  {
    type:'function', name:'swapETHToUSDC', stateMutability:'payable',
    inputs:[{type:'uint256'},{type:'address'}], outputs:[{type:'uint256'}]
  },
] as const;

/** Approve USDC persis sebesar input user (bukan MAX). */
export async function approveUSDCForSwap({
  chain = 'irys', account, amountUsdc, spender, onLog,
}:{
  chain?: ChainKey;
  account: Address;
  amountUsdc: string;         // USDC decimals (6)
  spender?: Address;          // default: custom router
  onLog?: (m: string)=>void;
}) {
  const rpc = getRpcUrlFor(chain);
  const pub = createPublicClient({ transport: http(rpc) });
  const irysChain = getIrysChain(chain);
  const usdc = getUsdcFor(chain);
  const router = (spender || getRouterFor(chain)) as Address;

  const dec = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName: 'decimals' }) as number;
  const needed = parseUnits(amountUsdc, dec || 6);

  const allowed = await pub.readContract({
    address: usdc, abi: ERC20_ABI, functionName: 'allowance', args: [account, router]
  }) as bigint;
  if (allowed >= needed) { onLog?.('ℹ️ Allowance cukup — skip approve'); return; }

  const eth = (window as any).ethereum;
  if (!eth) throw new Error('Wallet not found');
  const wallet = createWalletClient({ chain: irysChain, transport: custom(eth), account });

  try {
    const cur = await wallet.getChainId();
    if (cur !== irysChain.id) await wallet.switchChain({ id: irysChain.id });
  } catch {}

  onLog?.(`🔏 Approving USDC sebesar ${amountUsdc} (spender=${router})…`);
  // Beberapa token (contoh: USDT) butuh set 0 dulu bila allowance > 0 dan mau ubah nilai
  if (allowed > 0n) {
    const tx0 = await wallet.writeContract({
      address: usdc, abi: ERC20_ABI, functionName: 'approve',
      args: [router, 0n],
      account, chain: irysChain,
    });
    await pub.waitForTransactionReceipt({ hash: tx0 });
    onLog?.('ℹ️ Reset allowance ke 0 done');
  }

  const tx = await wallet.writeContract({
    address: usdc, abi: ERC20_ABI, functionName: 'approve',
    args: [router, needed],
    account, chain: irysChain,
  });
  await pub.waitForTransactionReceipt({ hash: tx });
  onLog?.(`✅ Approve confirmed: ${tx}`);
}

export async function swapUSDCtoETH({
  chain = 'irys', account, amountUsdc, minOutEth = '0', recipient, onLog
}:{
  chain?: ChainKey;
  account: Address;
  amountUsdc: string; // USDC decimals (6)
  minOutEth?: string; // DEV default 0
  recipient?: Address;
  onLog?: (m: string)=>void;
}) {
  const rpc = getRpcUrlFor(chain);
  const pub = createPublicClient({ transport: http(rpc) });
  const irysChain = getIrysChain(chain);
  const router = getRouterFor(chain);

  const dec = await pub.readContract({ address: getUsdcFor(chain), abi: ERC20_ABI, functionName: 'decimals' }) as number;
  const amtIn  = parseUnits(amountUsdc, dec || 6);
  const minOut = parseEther(minOutEth);

  const eth = (window as any).ethereum;
  if (!eth) throw new Error('Wallet not found');
  const wallet = createWalletClient({ chain: irysChain, transport: custom(eth), account });

  try {
    const cur = await wallet.getChainId();
    if (cur !== irysChain.id) await wallet.switchChain({ id: irysChain.id });
  } catch {}

  onLog?.('🧪 swapUSDCToETH(...) via CustomRouter');
  const hash = await wallet.writeContract({
    address: router,
    abi: CUSTOM_ROUTER_ABI,
    functionName: 'swapUSDCToETH',
    args: [amtIn, minOut, (recipient || account)],
    account,
    chain: irysChain,
  });
  await pub.waitForTransactionReceipt({ hash });
  onLog?.(`✅ Swap USDC→ETH OK: ${hash}`);
  return hash;
}

export async function swapETHtoUSDC({
  chain = 'irys', account, amountEth, minOutUsdc = '0', recipient, onLog
}:{
  chain?: ChainKey;
  account: Address;
  amountEth: string;    // "0.001" etc
  minOutUsdc?: string;  // DEV default 0
  recipient?: Address;
  onLog?: (m: string)=>void;
}) {
  const rpc = getRpcUrlFor(chain);
  const pub = createPublicClient({ transport: http(rpc) });
  const irysChain = getIrysChain(chain);
  const router = getRouterFor(chain);

  const value = parseEther(amountEth);
  const dec = await pub.readContract({ address: getUsdcFor(chain), abi: ERC20_ABI, functionName: 'decimals' }) as number;
  const minOut = parseUnits(minOutUsdc, dec || 6);

  const eth = (window as any).ethereum;
  if (!eth) throw new Error('Wallet not found');
  const wallet = createWalletClient({ chain: irysChain, transport: custom(eth), account });

  try {
    const cur = await wallet.getChainId();
    if (cur !== irysChain.id) await wallet.switchChain({ id: irysChain.id });
  } catch {}

  onLog?.('🧪 swapETHToUSDC{value}(...) via CustomRouter');
  const hash = await wallet.writeContract({
    address: router,
    abi: CUSTOM_ROUTER_ABI,
    functionName: 'swapETHToUSDC',
    args: [minOut, (recipient || account)],
    value,
    account,
    chain: irysChain,
  });
  await pub.waitForTransactionReceipt({ hash });
  onLog?.(`✅ Swap ETH→USDC OK: ${hash}`);
  return hash;
}
