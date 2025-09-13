'use client';
import { createPublicClient, http, type Address } from 'viem';
import { irys } from '@/lib/irys';
import {
  getRouterFor, getUsdcFor, getWethFor,
  getV2FactoryFor, getV3FactoryFor, type ChainKey
} from '@/app/irys/lib/addr';

const ERC20_ABI = [
  { type:'function', name:'decimals', stateMutability:'view', inputs:[], outputs:[{type:'uint8'}] },
] as const;

const V2_FACTORY_ABI = [
  { type:'function', name:'getPair', stateMutability:'view',
    inputs:[{type:'address'},{type:'address'}], outputs:[{type:'address'}] },
] as const;

const V3_FACTORY_ABI = [
  { type:'function', name:'getPool', stateMutability:'view',
    inputs:[{type:'address'},{type:'address'},{type:'uint24'}], outputs:[{type:'address'}] },
] as const;

const ZERO = '0x0000000000000000000000000000000000000000';

export type SwapDir = 'USDC_TO_ETH' | 'ETH_TO_USDC';
export type RouteInfo =
  | { kind:'v3'; addr: `0x${string}`; fee: 100|500|3000|10000 }
  | { kind:'v2'; addr: `0x${string}` };

function sortTokens<T extends `0x${string}`>(a: T, b: T): [T, T] {
  return a.toLowerCase() < b.toLowerCase() ? [a,b] : [b,a];
}

async function isDeployed(addr: `0x${string}`) {
  const pub = createPublicClient({ chain: irys, transport: http(irys.rpcUrls.default.http[0]) });
  const code = await pub.getBytecode({ address: addr });
  return !!(code && code !== '0x');
}

async function detectV3Once(factory: `0x${string}`, a: `0x${string}`, b: `0x${string}`, fee: 100|500|3000|10000) {
  const pub = createPublicClient({ chain: irys, transport: http(irys.rpcUrls.default.http[0]) });
  const [t0,t1] = sortTokens(a,b);
  const pool = await pub.readContract({ address: factory, abi: V3_FACTORY_ABI, functionName:'getPool', args:[t0,t1,fee] }) as `0x${string}`;
  return pool.toLowerCase() === ZERO ? null : pool;
}

async function detectV3Auto(factory: `0x${string}`, a: `0x${string}`, b: `0x${string}`) {
  for (const f of [500,3000,10000] as const) {
    const p = await detectV3Once(factory, a, b, f);
    if (p) return { addr: p, fee: f };
  }
  return null;
}

async function detectV2(factory: `0x${string}`, a: `0x${string}`, b: `0x${string}`) {
  const pub = createPublicClient({ chain: irys, transport: http(irys.rpcUrls.default.http[0]) });
  const [t0,t1] = sortTokens(a,b);
  const pair = await pub.readContract({ address: factory, abi: V2_FACTORY_ABI, functionName:'getPair', args:[t0,t1] }) as `0x${string}`;
  return pair.toLowerCase() === ZERO ? null : pair;
}

/** Deteksi pra-swap: validasi kontrak & (opsional) pool */
export async function detectBeforeSwap({
  chain='irys' as ChainKey, direction,
}: { chain?: ChainKey; direction: SwapDir }): Promise<{
  usdc: `0x${string}`; weth: `0x${string}`; router: `0x${string}`; route?: RouteInfo;
}> {
  const router = getRouterFor(chain) as `0x${string}`;
  const usdc   = getUsdcFor(chain)   as `0x${string}`;
  const weth   = getWethFor(chain)   as `0x${string}`;

  // basic deployed checks
  const [okRouter, okUsdc, okWeth] = await Promise.all([
    isDeployed(router), isDeployed(usdc), isDeployed(weth),
  ]);
  if (!okRouter) throw new Error('Router not deployed on Irys');
  if (!okUsdc)   throw new Error('USDC not deployed on Irys');
  if (!okWeth)   throw new Error('WETH not deployed on Irys');

  // USDC must be 6 decimals
  const pub = createPublicClient({ chain: irys, transport: http(irys.rpcUrls.default.http[0]) });
  const dec = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName:'decimals' }) as number;
  if (dec !== 6) throw new Error(`USDC decimals=${dec} (expected 6)`);

  // (optional) detect pool jika factory tersedia
  const v3Factory = getV3FactoryFor(chain);
  const v2Factory = getV2FactoryFor(chain);
  const tokenIn  = direction === 'USDC_TO_ETH' ? usdc : weth;
  const tokenOut = direction === 'USDC_TO_ETH' ? weth : usdc;

  let route: RouteInfo|undefined;
  if (v3Factory) {
    const r = await detectV3Auto(v3Factory as `0x${string}`, tokenIn, tokenOut);
    if (r) route = { kind:'v3', addr: r.addr as `0x${string}`, fee: r.fee as 500|3000|10000 };
  }
  if (!route && v2Factory) {
    const p = await detectV2(v2Factory as `0x${string}`, tokenIn, tokenOut);
    if (p) route = { kind:'v2', addr: p as `0x${string}` };
  }

  return { usdc, weth, router, route };
}
