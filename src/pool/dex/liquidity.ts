'use client';

import {
  createPublicClient, createWalletClient, http, custom, parseUnits, parseEther, type Address
} from 'viem';
import type { ChainKey } from './env'; 
// ENV (Irys)
const IRYS_RPC  = (process.env.NEXT_PUBLIC_IRYS_RPC_URL || process.env.NEXT_PUBLIC_RPC_IRYS || '');
const IRYS_CHAIN_ID_HEX = process.env.NEXT_PUBLIC_IRYS_CHAIN_ID_HEX || '0x0';
const V2_ROUTER_IRYS = (process.env.NEXT_PUBLIC_V2_ROUTER_IRYS || '') as Address;

const ERC20_ABI = [
  { type:'function', name:'decimals',  stateMutability:'view', inputs:[], outputs:[{type:'uint8'}] },
  { type:'function', name:'allowance', stateMutability:'view', inputs:[{type:'address'},{type:'address'}], outputs:[{type:'uint256'}] },
  { type:'function', name:'approve',   stateMutability:'nonpayable', inputs:[{type:'address'},{type:'uint256'}], outputs:[{type:'bool'}] },
  { type:'function', name:'balanceOf', stateMutability:'view', inputs:[{type:'address'}], outputs:[{type:'uint256'}] },
] as const;


const V2_ROUTER_ABI = [
  {
    type:'function', name:'addLiquidity', stateMutability:'nonpayable',
    inputs:[
      {type:'address'},{type:'address'},
      {type:'uint256'},{type:'uint256'},
      {type:'uint256'},{type:'uint256'},
      {type:'address'},{type:'uint256'}
    ],
    outputs:[{type:'uint256'},{type:'uint256'},{type:'uint256'}]
  },
  {
    type:'function', name:'addLiquidityETH', stateMutability:'payable',
    inputs:[
      {type:'address'},
      {type:'uint256'},
      {type:'uint256'},
      {type:'uint256'},
      {type:'address'},
      {type:'uint256'}
    ],
    outputs:[{type:'uint256'},{type:'uint256'},{type:'uint256'}]
  },
] as const;

function getChainObj() {
  const id = parseInt(IRYS_CHAIN_ID_HEX, 16) || 0;
  return {
    id,
    name: 'Irys',
    nativeCurrency: { name:'IRYS', symbol:(process.env.NEXT_PUBLIC_NATIVE_SYMBOL_IRYS||'IRYS').split(',')[0]||'IRYS', decimals:18 },
    rpcUrls: { default: { http: [IRYS_RPC] }, public: { http: [IRYS_RPC] } },
  } as const;
}

function getPub() {
  if (!IRYS_RPC) throw new Error('Missing NEXT_PUBLIC_IRYS_RPC_URL (atau NEXT_PUBLIC_RPC_IRYS)');
  return createPublicClient({ transport: http(IRYS_RPC) });
}

function getWallet(account: Address) {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('Wallet not found');
  const chain = getChainObj();
  return createWalletClient({ chain, transport: custom(eth), account });
}


export async function approveTokenExact({
  chain, account, token, spender, amountRaw, onLog,
}:{
  chain: ChainKey; account: Address; token: Address; spender: Address; amountRaw: bigint;
  onLog?: (m:string)=>void;
}) {
  const pub = getPub();
  const wallet = getWallet(account);
  try {
    const cur = await wallet.getChainId();
    if (cur !== getChainObj().id) await wallet.switchChain({ id: getChainObj().id });
  } catch {}

  const allowed = await pub.readContract({
    address: token, abi: ERC20_ABI, functionName: 'allowance', args: [account, spender]
  }) as bigint;
  if (allowed >= amountRaw) { onLog?.('ℹ️ Allowance cukup — skip approve'); return; }

  onLog?.(`🔏 Approving ${token} for ${spender} amount=${amountRaw.toString()}…`);
  if (allowed > 0n) {
    const tx0 = await wallet.writeContract({
      address: token, abi: ERC20_ABI, functionName: 'approve',
      args: [spender, 0n], account, chain: getChainObj(),
    });
    await pub.waitForTransactionReceipt({ hash: tx0 });
    onLog?.('ℹ️ Reset allowance ke 0 done');
  }
  const tx = await wallet.writeContract({
    address: token, abi: ERC20_ABI, functionName: 'approve',
    args: [spender, amountRaw], account, chain: getChainObj(),
  });
  await pub.waitForTransactionReceipt({ hash: tx });
  onLog?.(`✅ Approve confirmed: ${tx}`);
}

/** Add Liquidity ERC20 + ERC20 (V2) — parse amount dari string decimals token secara otomatis. */
export async function addLiquidityV2Tokens({
  chain, account, tokenA, tokenB, amountADec, amountBDec, slippageBps = 50, onLog,
}:{
  chain: ChainKey; account: Address; tokenA: Address; tokenB: Address;
  amountADec: string; amountBDec: string; slippageBps?: number;
  onLog?: (m:string)=>void;
}) {
  if (!V2_ROUTER_IRYS) throw new Error('Missing NEXT_PUBLIC_V2_ROUTER_IRYS');
  const pub = getPub();
  const wallet = getWallet(account);
  try {
    const cur = await wallet.getChainId();
    if (cur !== getChainObj().id) await wallet.switchChain({ id: getChainObj().id });
  } catch {}

  const decA = await pub.readContract({ address: tokenA, abi: ERC20_ABI, functionName:'decimals' }) as number;
  const decB = await pub.readContract({ address: tokenB, abi: ERC20_ABI, functionName:'decimals' }) as number;

  const amtA = parseUnits(amountADec, decA || 18);
  const amtB = parseUnits(amountBDec, decB || 18);
  const minA = (amtA * BigInt(10_000 - slippageBps)) / 10_000n;
  const minB = (amtB * BigInt(10_000 - slippageBps)) / 10_000n;
  const deadline = BigInt(Math.floor(Date.now()/1000) + 600);

  onLog?.(`🧪 addLiquidity(tokenA=${tokenA}, tokenB=${tokenB}, A=${amountADec}, B=${amountBDec})`);
  const hash = await wallet.writeContract({
    address: V2_ROUTER_IRYS,
    abi: V2_ROUTER_ABI,
    functionName: 'addLiquidity',
    args: [tokenA, tokenB, amtA, amtB, minA, minB, account, deadline],
    account,
    chain: getChainObj(),
  });
  await pub.waitForTransactionReceipt({ hash });
  onLog?.(`✅ LP added (ERC20 pair): ${hash}`);
  return hash;
}

/** Add Liquidity ERC20 + ETH (V2) — amount token pakai decimals token; ETH pakai parseEther. */
export async function addLiquidityV2WithETH({
  chain, account, token, amountTokenDec, amountEthDec, slippageBps = 50, onLog,
}:{
  chain: ChainKey; account: Address; token: Address;
  amountTokenDec: string; amountEthDec: string; slippageBps?: number;
  onLog?: (m:string)=>void;
}) {
  if (!V2_ROUTER_IRYS) throw new Error('Missing NEXT_PUBLIC_V2_ROUTER_IRYS');
  const pub = getPub();
  const wallet = getWallet(account);
  try {
    const cur = await wallet.getChainId();
    if (cur !== getChainObj().id) await wallet.switchChain({ id: getChainObj().id });
  } catch {}

  const dec = await pub.readContract({ address: token, abi: ERC20_ABI, functionName:'decimals' }) as number;
  const amtToken = parseUnits(amountTokenDec, dec || 18);
  const amtETH   = parseEther(amountEthDec);
  const minTok   = (amtToken * BigInt(10_000 - slippageBps)) / 10_000n;
  const minETH   = (amtETH   * BigInt(10_000 - slippageBps)) / 10_000n;
  const deadline = BigInt(Math.floor(Date.now()/1000) + 600);

  onLog?.(`🧪 addLiquidityETH(token=${token}, token=${amountTokenDec}, eth=${amountEthDec})`);
  const hash = await wallet.writeContract({
    address: V2_ROUTER_IRYS,
    abi: V2_ROUTER_ABI,
    functionName: 'addLiquidityETH',
    args: [token, amtToken, minTok, minETH, account, deadline],
    value: amtETH,
    account,
    chain: getChainObj(),
  });
  await pub.waitForTransactionReceipt({ hash });
  onLog?.(`✅ LP added (ETH pair): ${hash}`);
  return hash;
}
