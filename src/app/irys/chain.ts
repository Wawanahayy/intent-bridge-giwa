'use client';
import { defineChain } from 'viem';
import { getRpcUrlFor, type ChainKey } from './addr';


const IRYS_CHAIN_ID_HEX = process.env.NEXT_PUBLIC_IRYS_CHAIN_ID_HEX || '0x4f6'; // 0x4f6 = 1270
const IRYS_CHAIN_ID = Number(IRYS_CHAIN_ID_HEX) || parseInt(IRYS_CHAIN_ID_HEX, 16) || 1270;

export function getIrysChain(chain: ChainKey = 'irys') {
  const rpc = getRpcUrlFor(chain);
  return defineChain({
    id: IRYS_CHAIN_ID,
    name: 'Irys Testnet',
    nativeCurrency: { name: 'Irys', symbol: 'IRYS', decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
    testnet: true,
  });
}
