// Pool env — literal keys only
import { defineChain } from 'viem';

export type ChainKey = 'irys';
export type Address = `0x${string}`;

const IRYS_RPC_URL   = process.env.NEXT_PUBLIC_IRYS_RPC_URL || process.env.NEXT_PUBLIC_RPC_IRYS || '';
const V2_ROUTER_IRYS = process.env.NEXT_PUBLIC_V2_ROUTER_IRYS as Address | undefined;
const WIRYS_IRYS     = process.env.NEXT_PUBLIC_WIRYS_IRYS     as Address | undefined;
const V2_FACTORY_IRYS= process.env.NEXT_PUBLIC_V2_FACTORY_IRYS as Address | undefined;
const V3_FACTORY_IRYS= process.env.NEXT_PUBLIC_V3_FACTORY_IRYS as Address | undefined;
const IRYS_CHAIN_ID_HEX = process.env.NEXT_PUBLIC_IRYS_CHAIN_ID_HEX || '0x4f6';
const IRYS_CHAIN_ID = Number(IRYS_CHAIN_ID_HEX) || parseInt(IRYS_CHAIN_ID_HEX, 16) || 1270;

export function getRpc(_: ChainKey) {
  if (!IRYS_RPC_URL) throw new Error('Missing NEXT_PUBLIC_IRYS_RPC_URL (atau NEXT_PUBLIC_RPC_IRYS)');
  return IRYS_RPC_URL;
}
export function getRouterV2(_: ChainKey) {
  if (!V2_ROUTER_IRYS) throw new Error('Missing NEXT_PUBLIC_V2_ROUTER_IRYS');
  return V2_ROUTER_IRYS;
}
export function getWeth(_: ChainKey) {
  if (!WIRYS_IRYS) throw new Error('Missing NEXT_PUBLIC_WIRYS_IRYS');
  return WIRYS_IRYS;
}
export function getV2Factory(_: ChainKey) { return V2_FACTORY_IRYS; }
export function getV3Factory(_: ChainKey) { return V3_FACTORY_IRYS; }

// === NEW: chain object untuk viem wallet/writeContract
export function getChainObj(chain: ChainKey) {
  const rpc = getRpc(chain);
  return defineChain({
    id: IRYS_CHAIN_ID,
    name: 'Irys Testnet',
    nativeCurrency: { name: 'Irys', symbol: 'IRYS', decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
    testnet: true,
  });
}
