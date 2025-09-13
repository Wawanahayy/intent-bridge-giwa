'use client';

import { createPublicClient, http, type Address } from 'viem';
import { getRpc, getV2Factory, getV3Factory, type ChainKey } from './env';

const ZERO = '0x0000000000000000000000000000000000000000';

const V2_FACTORY_ABI = [
  { type:'function', name:'getPair', stateMutability:'view',
    inputs:[{type:'address'},{type:'address'}], outputs:[{type:'address'}] },
] as const;

const V3_FACTORY_ABI = [
  { type:'function', name:'getPool', stateMutability:'view',
    inputs:[{type:'address'},{type:'address'},{type:'uint24'}], outputs:[{type:'address'}] },
] as const;

type FeeTiers = 500 | 3000 | 10000;
export type DetectResult =
  | { kind:'v3'; pool: Address; fee: FeeTiers }
  | { kind:'v2'; pair: Address }
  | null;

function sortTokens<T extends Address>(a: T, b: T): [T,T] {
  return a.toLowerCase() < b.toLowerCase() ? [a,b] : [b,a];
}

export async function detectPoolAuto({
  chain, tokenA, tokenB,
}:{
  chain: ChainKey;
  tokenA: Address;
  tokenB: Address;
}): Promise<DetectResult> {
  const pub = createPublicClient({ transport: http(getRpc(chain)) });
  const [a, b] = sortTokens(tokenA, tokenB);

  const v3 = getV3Factory(chain);
  if (v3) {
    for (const fee of [500, 3000, 10000] as const) {
      const pool = await pub.readContract({
        address: v3,
        abi: V3_FACTORY_ABI,
        functionName: 'getPool',
        args: [a, b, fee],
      }) as Address;
      if (pool.toLowerCase() !== ZERO) {
        return { kind: 'v3', pool, fee };
      }
    }
  }

  const v2 = getV2Factory(chain);
  if (v2) {
    const pair = await pub.readContract({
      address: v2,
      abi: V2_FACTORY_ABI,
      functionName: 'getPair',
      args: [a, b],
    }) as Address;
    if (pair.toLowerCase() !== ZERO) {
      return { kind: 'v2', pair };
    }
  }

  return null;
}
