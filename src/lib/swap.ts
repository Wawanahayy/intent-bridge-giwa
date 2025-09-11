'use client';

import type { Address } from 'viem';
import {
  createPublicClient, createWalletClient, custom, http,
  parseUnits, parseEther, getAddress
} from 'viem';
import { sepolia } from 'viem/chains';
import { getInjectedProvider } from '@/lib/wallet';

const CUSTOM_ROUTER_ABI = [
  { type:'function', name:'swapUSDCToETH', stateMutability:'nonpayable',
    inputs:[{name:'amountIn',type:'uint256'},{name:'amountOutMin',type:'uint256'},{name:'to',type:'address'}],
    outputs:[{type:'uint256'}] },
  { type:'function', name:'swapETHToUSDC', stateMutability:'payable',
    inputs:[{name:'amountOutMin',type:'uint256'},{name:'to',type:'address'}],
    outputs:[{type:'uint256'}] },
] as const;

// +++ UniswapV3
const V3_ABI = [
  { // exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) returns (uint256)
    type:'function', name:'exactInputSingle', stateMutability:'payable',
    inputs:[{components:[
      {name:'tokenIn',type:'address'},
      {name:'tokenOut',type:'address'},
      {name:'fee',type:'uint24'},
      {name:'recipient',type:'address'},
      {name:'deadline',type:'uint256'},
      {name:'amountIn',type:'uint256'},
      {name:'amountOutMinimum',type:'uint256'},
      {name:'sqrtPriceLimitX96',type:'uint160'},
    ], name:'params', type:'tuple'}],
    outputs:[{name:'amountOut',type:'uint256'}]
  }
] as const;

const WETH_ABI = [
  { type:'function', name:'deposit', stateMutability:'payable', inputs:[], outputs:[] },
  { type:'function', name:'withdraw', stateMutability:'nonpayable', inputs:[{name:'wad',type:'uint256'}], outputs:[] },
  { type:'function', name:'balanceOf', stateMutability:'view', inputs:[{name:'owner',type:'address'}], outputs:[{type:'uint256'}] },
] as const;

const ERC20_ABI = [
  { type:'function', name:'balanceOf', stateMutability:'view',
    inputs:[{name:'owner',type:'address'}], outputs:[{type:'uint256'}] },
  { type:'function', name:'allowance', stateMutability:'view',
    inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}], outputs:[{type:'uint256'}] },
  { type:'function', name:'approve', stateMutability:'nonpayable',
    inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}], outputs:[{type:'bool'}] },
] as const;

const MAX_UINT = (2n ** 256n) - 1n;

const DEFAULTS = {
  RPC_SEPOLIA: 'https://sepolia.drpc.org',
  USDC_SEPOLIA: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  CUSTOM_ROUTER_SEPOLIA: '0x6e34AE9C414aa726DbBAf98b1686CB8fe43b8EAb',
  V3_ROUTER_SEPOLIA: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
  WETH_SEPOLIA: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
  UNWRAP_WETH_AFTER_SWAP: 'true',
};

function getEnv(k: string, dflt?: string) {
  const v = (process.env as any)[k];
  return (v && String(v)) || dflt;
}

function mkClients() {
  const rpc = getEnv('NEXT_PUBLIC_RPC_SEPOLIA', DEFAULTS.RPC_SEPOLIA)!;
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });
  const eth = getInjectedProvider();
  const walletClient = createWalletClient({ chain: sepolia, transport: custom(eth) });
  return { publicClient, walletClient };
}


export async function swapUSDCToETH_viaCustom({
  account, usdcAmount, minOutWei = 0n, recipient, onLog,
}:{
  account: Address; usdcAmount: string; minOutWei?: bigint; recipient?: Address;
  onLog?: (m:string)=>void;
}) {
  const usdc   = getAddress(getEnv('NEXT_PUBLIC_USDC_SEPOLIA', DEFAULTS.USDC_SEPOLIA)!);
  const router = getAddress(getEnv('NEXT_PUBLIC_CUSTOM_ROUTER_SEPOLIA', DEFAULTS.CUSTOM_ROUTER_SEPOLIA)!);

  const { publicClient, walletClient } = mkClients();
  try { const id = await walletClient.getChainId(); if (id !== sepolia.id) await walletClient.switchChain({ id: sepolia.id }); } catch {}

  const to = (recipient ?? account) as Address;
  const amountIn = parseUnits(String(usdcAmount), 6);

  const allowance: bigint = await publicClient.readContract({ address: usdc, abi: ERC20_ABI, functionName: 'allowance', args: [account, router] });
  if (allowance < amountIn) {
    onLog?.('🔏 Approving USDC to custom router…');
    const txA = await walletClient.writeContract({ address: usdc, abi: ERC20_ABI, functionName: 'approve', args: [router, MAX_UINT], account });
    await publicClient.waitForTransactionReceipt({ hash: txA });
  }

  onLog?.(`🔁 swapUSDCToETH(${usdcAmount} USDC, minOut=${minOutWei})…`);
  const hash = await walletClient.writeContract({
    address: router, abi: CUSTOM_ROUTER_ABI, functionName: 'swapUSDCToETH',
    args: [amountIn, minOutWei, to], account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

export async function swapETHToUSDC_viaCustom({
  account, ethAmount, minOutUsdc = 0n, recipient, onLog,
}:{
  account: Address; ethAmount: string; minOutUsdc?: bigint; recipient?: Address;
  onLog?: (m:string)=>void;
}) {
  const router = getAddress(getEnv('NEXT_PUBLIC_CUSTOM_ROUTER_SEPOLIA', DEFAULTS.CUSTOM_ROUTER_SEPOLIA)!);
  const { publicClient, walletClient } = mkClients();
  try { const id = await walletClient.getChainId(); if (id !== sepolia.id) await walletClient.switchChain({ id: sepolia.id }); } catch {}

  const to = (recipient ?? account) as Address;
  const valueWei = parseEther(String(ethAmount));

  onLog?.(`🔁 swapETHToUSDC(value=${ethAmount} ETH, minOut=${minOutUsdc}, to=${to})…`);
  const hash = await walletClient.writeContract({
    address: router, abi: CUSTOM_ROUTER_ABI, functionName: 'swapETHToUSDC',
    args: [minOutUsdc, to], value: valueWei, account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}


function deadlineTs(sec?: number) {
  const now = Math.floor(Date.now()/1000);
  return BigInt(now + (sec && sec>0 ? sec : 900)); // default +15m
}

export async function swapUSDCToETH_viaUniswapV3({
  account, usdcAmount, minOutWei = 0n, recipient, deadlineSec, onLog,
}:{
  account: Address; usdcAmount: string; minOutWei?: bigint; recipient?: Address;
  deadlineSec?: number; onLog?: (m:string)=>void;
}) {
  const usdc   = getAddress(getEnv('NEXT_PUBLIC_USDC_SEPOLIA', DEFAULTS.USDC_SEPOLIA)!);
  const v3     = getAddress(getEnv('NEXT_PUBLIC_UNISWAP_V3_ROUTER_SEPOLIA', DEFAULTS.V3_ROUTER_SEPOLIA)!);
  const weth   = getAddress(getEnv('NEXT_PUBLIC_WETH_SEPOLIA', DEFAULTS.WETH_SEPOLIA)!);
  const unwrap = (getEnv('NEXT_PUBLIC_UNWRAP_WETH_AFTER_SWAP', DEFAULTS.UNWRAP_WETH_AFTER_SWAP) || '').toLowerCase() === 'true';

  const { publicClient, walletClient } = mkClients();
  try { const id = await walletClient.getChainId(); if (id !== sepolia.id) await walletClient.switchChain({ id: sepolia.id }); } catch {}

  const to = (recipient ?? account) as Address;
  const amountIn = parseUnits(String(usdcAmount), 6);

  // approve
  const allowance: bigint = await publicClient.readContract({ address: usdc, abi: ERC20_ABI, functionName: 'allowance', args: [account, v3] });
  if (allowance < amountIn) {
    onLog?.('🔏 Approving USDC to Uniswap V3 router…');
    const txA = await walletClient.writeContract({ address: usdc, abi: ERC20_ABI, functionName: 'approve', args: [v3, MAX_UINT], account });
    await publicClient.waitForTransactionReceipt({ hash: txA });
  }

  const preW = unwrap ? await publicClient.readContract({ address: weth, abi: WETH_ABI, functionName: 'balanceOf', args: [to] }) as bigint : 0n;

  onLog?.(`🔁 UniswapV3 exactInputSingle USDC→WETH (fee 0.25%)…`);
  const params = {
    tokenIn: usdc,
    tokenOut: weth,
    fee: 2500,
    recipient: to,
    deadline: deadlineTs(deadlineSec),
    amountIn,
    amountOutMinimum: minOutWei,
    sqrtPriceLimitX96: 0n,
  } as const;

  const hash = await walletClient.writeContract({
    address: v3, abi: V3_ABI, functionName: 'exactInputSingle', args: [params], account,
  });
  const rc = await publicClient.waitForTransactionReceipt({ hash });

  if (unwrap) {
    const postW = await publicClient.readContract({ address: weth, abi: WETH_ABI, functionName: 'balanceOf', args: [to] }) as bigint;
    const got = postW - preW;
    if (got > 0n) {
      onLog?.(`💧 Unwrap WETH→ETH: ${got.toString()} wei`);
      const unwrapHash = await walletClient.writeContract({
        address: weth, abi: WETH_ABI, functionName: 'withdraw', args: [got], account: to,
      });
      await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
    }
  }

  return { hash, receipt: rc };
}

export async function swapETHToUSDC_viaUniswapV3({
  account, ethAmount, minOutUsdc = 0n, recipient, deadlineSec, onLog,
}:{
  account: Address; ethAmount: string; minOutUsdc?: bigint; recipient?: Address;
  deadlineSec?: number; onLog?: (m:string)=>void;
}) {
  const v3   = getAddress(getEnv('NEXT_PUBLIC_UNISWAP_V3_ROUTER_SEPOLIA', DEFAULTS.V3_ROUTER_SEPOLIA)!);
  const weth = getAddress(getEnv('NEXT_PUBLIC_WETH_SEPOLIA', DEFAULTS.WETH_SEPOLIA)!);
  const usdc = getAddress(getEnv('NEXT_PUBLIC_USDC_SEPOLIA', DEFAULTS.USDC_SEPOLIA)!);

  const { publicClient, walletClient } = mkClients();
  try { const id = await walletClient.getChainId(); if (id !== sepolia.id) await walletClient.switchChain({ id: sepolia.id }); } catch {}

  const to = (recipient ?? account) as Address;
  const valueWei = parseEther(String(ethAmount));

  // Router akan wrap ETH→WETH pakai msg.value
  onLog?.(`🔁 UniswapV3 exactInputSingle ETH→USDC via WETH (fee 0.25%)…`);
  const params = {
    tokenIn: weth,
    tokenOut: usdc,
    fee: 2500,
    recipient: to,
    deadline: deadlineTs(deadlineSec),
    amountIn: valueWei,            
    amountOutMinimum: minOutUsdc,  
    sqrtPriceLimitX96: 0n,
  } as const;

  const hash = await walletClient.writeContract({
    address: v3, abi: V3_ABI, functionName: 'exactInputSingle', args: [params], value: valueWei, account,
  });
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt: rc };
}
