// src/lib/intent-nlp.ts
'use client';

import type { Address } from 'viem';

export type Mode =
  | 'L1_TO_L2'
  | 'L2_TO_L1'
  | 'PIPELINE_3R_USDCBASE_TO_ETHGIWA'
  | 'SWAP_ONLY_SEPOLIA';

export type ParsedUiPatch = {
  mode: Mode;
  set: Partial<{
    amountEth: string;
    amountUsdc: string;
    to: Address;

  }>;
  note?: string;
};

const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);

function pickAmount(text: string): string | undefined {

  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m?.[1];
}

function pickAddress(text: string): Address | undefined {
  const m = text.match(/0x[a-fA-F0-9]{40}/);
  return (m?.[0] as Address) || undefined;
}

export function parseCommandToIntent(textRaw: string): ParsedUiPatch | null {
  const text = textRaw.trim().toLowerCase();

  if (!text) return null;

  const amount = pickAmount(text);
  const to = pickAddress(textRaw); 

  const has = (...keys: string[]) => keys.every(k => text.includes(k));


  if (has('bridge', 'usdc', 'base') && (has('giwa') || has('eth', 'giwa'))) {
    return {
      mode: 'PIPELINE_3R_USDCBASE_TO_ETHGIWA',
      set: { amountUsdc: amount ?? '1', ...(to ? { to } : {}) },
      note: 'Route: CCTP (Base→Sepolia) → CustomPool (USDC→ETH) → OP Bridge (Sepolia→GIWA).',
    };
  }

  // 2) Deposit ETH Sepolia -> GIWA (banyak orang ngetik "swap ... ke giwa")
  if ((has('bridge') || has('swap')) && has('eth', 'sepolia') && has('giwa')) {
    return {
      mode: 'L1_TO_L2',
      set: { amountEth: amount ?? '0.001', ...(to ? { to } : {}) },
      note: 'Interpretasi: deposit ETH L1 (Sepolia) → L2 (GIWA).',
    };
  }

  if ((has('withdraw') || has('bridge')) && has('eth', 'giwa') && has('sepolia')) {
    return {
      mode: 'L2_TO_L1',
      set: { amountEth: amount ?? '0.001', ...(to ? { to } : {}) },
      note: 'Withdraw ETH L2 (GIWA) → L1 (Sepolia).',
    };
  }


  if (has('swap') && has('usdc') && has('eth') && has('sepolia') && !has('giwa')) {
    return {
      mode: 'SWAP_ONLY_SEPOLIA',
      set: { amountUsdc: amount ?? '1', ...(to ? { to } : {}) },
      note: 'Swap-only di Sepolia via custom router: USDC → ETH.',
    };
  }


  if (has('swap') && has('eth') && has('usdc') && has('sepolia') && !has('giwa')) {

    return {
      mode: 'SWAP_ONLY_SEPOLIA',
      set: { amountEth: amount ?? '0.001', ...(to ? { to } : {}) },
      note: 'Swap-only di Sepolia: ETH → USDC (butuh UI arah swap kalau mau persis).',
    };
  }

  if ((has('bridge') || has('deposit')) && has('eth') && has('giwa')) {
    return {
      mode: 'L1_TO_L2',
      set: { amountEth: amount ?? '0.001', ...(to ? { to } : {}) },
      note: 'Interpretasi default: deposit ETH ke GIWA.',
    };
  }

  return null;
}
