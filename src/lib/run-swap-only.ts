'use client';

import type { Address } from 'viem';
import {
  swapUSDCToETH_viaCustom, swapETHToUSDC_viaCustom,
  swapUSDCToETH_viaUniswapV3, swapETHToUSDC_viaUniswapV3,
} from '@/lib/swap';

export type SwapDirection = 'USDC_TO_ETH' | 'ETH_TO_USDC';
export type SwapEngine = 'custom' | 'uniswapV3_025';

export async function runSwapOnly({
  account, direction, amount, to, minOut, engine = 'custom', deadlineSec, onLog,
}:{
  account: Address;
  direction: SwapDirection;
  amount: string;       // USDC jika USDC→ETH, ETH jika ETH→USDC
  to?: Address;
  minOut?: bigint;
  engine?: SwapEngine;
  deadlineSec?: number;
  onLog?: (m:string)=>void;
}) {
  if (direction === 'USDC_TO_ETH') {
    if (engine === 'custom') {
      return swapUSDCToETH_viaCustom({
        account,
        usdcAmount: amount,
        minOutWei: minOut ?? 0n,
        recipient: to ?? account,
        onLog,
      });
    } else {
      return swapUSDCToETH_viaUniswapV3({
        account,
        usdcAmount: amount,
        minOutWei: minOut ?? 0n,
        recipient: to ?? account,
        deadlineSec,
        onLog,
      });
    }
  } else {
    if (engine === 'custom') {
      return swapETHToUSDC_viaCustom({
        account,
        ethAmount: amount,
        minOutUsdc: minOut ?? 0n,
        recipient: to ?? account,
        onLog,
      });
    } else {
      return swapETHToUSDC_viaUniswapV3({
        account,
        ethAmount: amount,
        minOutUsdc: minOut ?? 0n,
        recipient: to ?? account,
        deadlineSec,
        onLog,
      });
    }
  }
}
