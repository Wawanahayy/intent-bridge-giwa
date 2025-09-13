// src/lib/addr.ts
'use client';

export type ChainKey = 'irys';


function pick(k: string, alts: string[] = [], dflt = '') {
  const env = process.env as Record<string, string | undefined>;
  if (env[k]) return env[k]!;
  for (const a of alts) if (env[a]) return env[a]!;
  return dflt;
}
function pickAddr(...keys: string[]): `0x${string}` | undefined {
  const env = process.env as Record<string, string | undefined>;
  for (const k of keys) {
    const v = env[k];
    if (v && /^0x[0-9a-fA-F]{40}$/.test(v)) return v as `0x${string}`;
  }
  return undefined;
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
  const v =
    pickAddr('NEXT_PUBLIC_CUSTOM_ROUTER_IRYS', 'NEXT_PUBLIC_CUSTOM_ROUTER', 'NEXT_PUBLIC_CUSTOM_ROUTER_SEPOLIA') ||
    ('0xD8ad25E58c876ae853915c8fBC4Fcc20D7eC7f30' as `0x${string}`);
  return v;
}
export function getUsdcFor(_: ChainKey) {
  const v = pickAddr('NEXT_PUBLIC_USDC_IRYS', 'NEXT_PUBLIC_USDC', 'NEXT_PUBLIC_USDC_SEPOLIA');
  // kalau kosong, masih kembalikan dummy yang valid-format supaya tidak throw.
  return (v || '0x0000000000000000000000000000000000000001') as `0x${string}`;
}
export function getWethFor(_: ChainKey) {
  const v = pickAddr('NEXT_PUBLIC_WIRYS_IRYS', 'NEXT_PUBLIC_WETH_IRYS', 'NEXT_PUBLIC_WETH_SEPOLIA');
  return (v || '0x0000000000000000000000000000000000000002') as `0x${string}`;
}


export function getV2FactoryFor(_: ChainKey) {
  return pickAddr('NEXT_PUBLIC_V2_FACTORY_IRYS');
}
export function getV3FactoryFor(_: ChainKey) {
  return pickAddr('NEXT_PUBLIC_V3_FACTORY_IRYS');
}
export function getV2RouterFor(_: ChainKey) {
  return pickAddr('NEXT_PUBLIC_V2_ROUTER_IRYS');
}
