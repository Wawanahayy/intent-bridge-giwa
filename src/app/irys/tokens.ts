// src/app/irys/tokens.ts
'use client';
import { createPublicClient, http, custom, isAddress, getAddress, parseAbi, type Address, type PublicClient } from 'viem';
import { getRpcUrlFor, type ChainKey } from './addr';

export type UToken = { id: string; symbol: string; address?: Address; decimals: number; kind: 'native'|'erc20' };

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

let _client: PublicClient | null = null;
function getClient(chain: ChainKey = 'irys'): PublicClient {
  if (_client) return _client;
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    _client = createPublicClient({ transport: custom((window as any).ethereum) });
    return _client;
  }
  const url = getRpcUrlFor(chain); // <- sudah punya fallback
  _client = createPublicClient({ transport: http(url) });
  return _client;
}

function envAddr(v?: string): Address | null {
  if (!v) return null;
  const x = v.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(x)) return null;
  return getAddress(x) as Address;
}

export function getVerifiedTokens(): UToken[] {
  const raw = process.env.NEXT_PUBLIC_NATIVE_SYMBOL_IRYS || 'IRYS,WIRYS,';
  const [nativeSym = 'IRYS', wrappedSym = 'WIRYS', wrappedAddr = ''] = raw.split(',');
  const wirys = envAddr(wrappedAddr || process.env.NEXT_PUBLIC_WIRYS_IRYS);

  const out: UToken[] = [{ id: 'native', symbol: nativeSym || 'IRYS', decimals: 18, kind: 'native' }];
  if (wirys) out.push({ id: wirys.toLowerCase(), symbol: wrappedSym || 'WIRYS', address: wirys, decimals: 18, kind: 'erc20' });

  const usdcAddr = envAddr(process.env.NEXT_PUBLIC_USDC_IRYS);
  if (usdcAddr) out.push({ id: usdcAddr.toLowerCase(), symbol: 'USDC', address: usdcAddr, decimals: 6, kind: 'erc20' });

  // 🔧 terima delimiter koma juga
  const extra = (process.env.NEXT_PUBLIC_VERIFIED_TOKENS_IRYS || '')
    .split(/[\n;,|]+/) // <= PATCH: koma diperbolehkan
    .map(s => s.trim()).filter(Boolean);

  for (const item of extra) {
    const m = item.match(/^([A-Za-z0-9_\-]+)\s*:\s*(0x[a-fA-F0-9]{40})$/);
    if (m) {
      const sym = m[1].toUpperCase();
      const addr = getAddress(m[2]) as Address;
      if (!out.some(t => t.id === addr.toLowerCase())) out.push({ id: addr.toLowerCase(), symbol: sym, address: addr, decimals: 18, kind: 'erc20' });
      continue;
    }
    const addr = envAddr(item);
    if (addr && !out.some(t => t.id === addr.toLowerCase())) out.push({ id: addr.toLowerCase(), symbol: 'TOKEN', address: addr, decimals: 18, kind: 'erc20' });
  }

  const seen = new Set<string>();
  return out.filter(t => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}
