// src/app/irys/addr.ts
'use client';

export type ChainKey = 'irys';

function pick(k: string, alts: string[] = [], dflt = '') {
  const env = process.env as Record<string, string | undefined>;
  if (env[k]) return env[k]!;
  for (const a of alts) if (env[a]) return env[a]!;
  return dflt;
}

export function getRpcUrlFor(_: ChainKey) {
  return (
    pick('NEXT_PUBLIC_IRYS_RPC_URL', ['NEXT_PUBLIC_RPC_IRYS']) ||
    pick('NEXT_PUBLIC_RPC_SEPOLIA') ||
    pick('NEXT_PUBLIC_RPC') ||
    'https://testnet-rpc.irys.xyz/v1/execution-rpc'
  );
}

export function getRouterFor(_: ChainKey) {
  const v = process.env.NEXT_PUBLIC_CUSTOM_ROUTER_IRYS;
  if (!v) throw new Error('Missing NEXT_PUBLIC_CUSTOM_ROUTER_IRYS');
  return v as `0x${string}`;
}
export function getUsdcFor(_: ChainKey) {
  const v = process.env.NEXT_PUBLIC_USDC_IRYS;
  if (!v) throw new Error('Missing NEXT_PUBLIC_USDC_IRYS');
  return v as `0x${string}`;
}
export function getWethFor(_: ChainKey) {
  const v = process.env.NEXT_PUBLIC_WIRYS_IRYS;
  if (!v) throw new Error('Missing NEXT_PUBLIC_WIRYS_IRYS');
  return v as `0x${string}`;
}

// Optional factories (boleh undefined)
export function getV2FactoryFor(_: ChainKey) {
  return process.env.NEXT_PUBLIC_V2_FACTORY_IRYS as `0x${string}` | undefined;
}
export function getV2RouterFor(_: ChainKey) {
  return process.env.NEXT_PUBLIC_V2_ROUTER_IRYS as `0x${string}` | undefined;
}
export function getV3FactoryFor(_: ChainKey) {
  return process.env.NEXT_PUBLIC_V3_FACTORY_IRYS as `0x${string}` | undefined;
}
