import type { Address } from "viem";

export type RouterChoice = "CUSTOM" | "UNISWAP";

export function compileSwapOnlyIntent({
  account,
  direction,          
  amount,             
  to,
  deadlineSec,
  router,             
}:{
  account: Address;
  direction: "USDC_TO_ETH" | "ETH_TO_USDC";
  amount: string;
  to?: Address;
  deadlineSec?: number;
  router: RouterChoice;
}) {
  const mode = "SWAP_ONLY_SEPOLIA";
  const route =
    direction === "USDC_TO_ETH"
      ? [router === "CUSTOM" ? "CustomPool:USDC→ETH (Sepolia)" : "UniswapV3:USDC→WETH (Sepolia)"]
      : [router === "CUSTOM" ? "CustomPool:ETH→USDC (Sepolia)" : "UniswapV3:WETH→USDC (Sepolia)"];

  const base = {
    mode,
    to: (to ?? account),
    deadlineSec: deadlineSec ?? 300,
    route,
  } as any;

  if (direction === "USDC_TO_ETH") {
    base.amountUsdc = amount;
  } else {
    base.amountEth = amount;
  }

  return base;
}

export function compilePipelineIntent({
  account,
  amountUsdc,         
  to,
  deadlineSec,
  router,            
}:{
  account: Address;
  amountUsdc: string;
  to?: Address;
  deadlineSec?: number;
  router: RouterChoice;
}) {
  const mode = "PIPELINE_3R_USDCBASE_TO_ETHGIWA";
  const route = [
    "CCTP:USDC Base→Sepolia",
    router === "CUSTOM" ? "CustomPool:USDC→ETH (Sepolia)" : "Uniswap:USDC→WETH (Sepolia)",
    "OP:Sepolia→GIWA (ETH)",
  ];

  return {
    mode,
    to: (to ?? account),
    amountUsdc,
    deadlineSec: deadlineSec ?? 300,
    route,
  };
}
