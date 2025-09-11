'use client';
import { http, type Transport } from 'viem';

export type ChainKey = 'sepolia' | 'giwa' | 'base';

export async function getPublicTransport(chain: ChainKey): Promise<Transport> {
  const env = process.env as any;
  if (chain === 'sepolia') return http(env.NEXT_PUBLIC_RPC_SEPOLIA || 'https://sepolia.drpc.org');
  if (chain === 'giwa')     return http(env.NEXT_PUBLIC_RPC_GIWA    || 'https://sepolia-rpc.giwa.io');
  if (chain === 'base')     return http(env.NEXT_PUBLIC_RPC_BASE    || 'https://sepolia.base.org');
  return http('https://sepolia.drpc.org');
}
