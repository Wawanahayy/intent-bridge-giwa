'use client';
import { defineChain } from 'viem';

export const irys = defineChain({
  id: 1270, 
  name: 'Irys Testnet',
  nativeCurrency: { name: 'Irys', symbol: 'IRYS', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_IRYS as string] } },
  testnet: true,
});
