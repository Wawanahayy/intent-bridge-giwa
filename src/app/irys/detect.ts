'use client';

import { createPublicClient, http, type Address } from 'viem';
import {
  getRouterFor, getUsdcFor, getWethFor,
  getV2FactoryFor, getV3FactoryFor, getRpcUrlFor, type ChainKey
} from './addr';

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
  | { kind:'v3'; addr: Address; fee: 500|3000|10000 }
  | { kind:'v2'; addr: Address };

function sortTokens<T extends Address>(a: T, b: T): [T,T] {
  return a.toLowerCase() < b.toLowerCase() ? [a,b] : [b,a];
}
function makeClient(chain: ChainKey) {
  return createPublicClient({ transport: http(getRpcUrlFor(chain)) });
}
async function isDeployed(chain: ChainKey, addr: Address) {
  const pub = makeClient(chain);
  const code = await pub.getBytecode({ address: addr });
  return !!(code && code !== '0x');
}
async function detectV3Auto(chain: ChainKey, factory: Address, a: Address, b: Address) {
  const pub = makeClient(chain);
  const [t0,t1] = sortTokens(a,b);
  for (const fee of [500,3000,10000] as const) {
    const p = await pub.readContract({ address: factory, abi: V3_FACTORY_ABI, functionName:'getPool', args:[t0,t1,fee] }) as Address;
    if (p.toLowerCase() !== ZERO) return { addr: p as Address, fee };
  }
  return null;
}
async function detectV2(chain: ChainKey, factory: Address, a: Address, b: Address) {
  const pub = makeClient(chain);
  const [t0,t1] = sortTokens(a,b);
  const p = await pub.readContract({ address: factory, abi: V2_FACTORY_ABI, functionName:'getPair', args:[t0,t1] }) as Address;
  return p.toLowerCase() === ZERO ? null : p;
}

/** Deteksi pra-swap: validasi kontrak & (opsional) pool */
export async function preSwapDetect(direction: SwapDir, chain: ChainKey = 'irys'): Promise<{
  usdc: Address; weth: Address; router: Address; route?: RouteInfo;
}> {
  const pub    = makeClient(chain);
  const router = getRouterFor(chain) as Address;
  const usdc   = getUsdcFor(chain)   as Address;
  const weth   = getWethFor(chain)   as Address;

  const [okR, okU, okW] = await Promise.all([
    isDeployed(chain, router), isDeployed(chain, usdc), isDeployed(chain, weth)
  ]);
  if (!okR) throw new Error('Router not deployed on Irys');
  if (!okU) throw new Error('USDC not deployed on Irys');
  if (!okW) throw new Error('WETH not deployed on Irys');

  const dec = await pub.readContract({ address: usdc, abi: ERC20_ABI, functionName:'decimals' }) as number;
  if (dec !== 6) throw new Error(`USDC decimals=${dec} (expected 6)`);

  const v3 = getV3FactoryFor(chain);
  const v2 = getV2FactoryFor(chain);
  const tokenIn  = direction === 'USDC_TO_ETH' ? usdc : weth;
  const tokenOut = direction === 'USDC_TO_ETH' ? weth : usdc;

  let route: RouteInfo|undefined;
  if (v3) {
    const r = await detectV3Auto(chain, v3 as Address, tokenIn, tokenOut);
    if (r) route = { kind:'v3', addr: r.addr, fee: r.fee };
  }
  if (!route && v2) {
    const p = await detectV2(chain, v2 as Address, tokenIn, tokenOut);
    if (p) route = { kind:'v2', addr: p };
  }
  return { usdc, weth, router, route };
}
