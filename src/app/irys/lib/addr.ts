export type ChainKey = 'irys';

/** alamat penting untuk Irys */
export function getRouterFor(_: ChainKey) {
  return process.env.NEXT_PUBLIC_CUSTOM_ROUTER_IRYS as `0x${string}`;
}
export function getUsdcFor(_: ChainKey) {
  return process.env.NEXT_PUBLIC_USDC_IRYS as `0x${string}`;
}
export function getWethFor(_: ChainKey) {
  return process.env.NEXT_PUBLIC_WETH_IRYS as `0x${string}`;
}

/** OPTIONAL: isi kalau mau auto-detect pool */
export function getV2FactoryFor(_: ChainKey) {
  return process.env.NEXT_PUBLIC_V2_FACTORY_IRYS as `0x${string}` | undefined;
}
export function getV3FactoryFor(_: ChainKey) {
  return process.env.NEXT_PUBLIC_V3_FACTORY_IRYS as `0x${string}` | undefined;
}
