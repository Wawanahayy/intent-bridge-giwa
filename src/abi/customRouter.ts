// src/abi/customRouter.ts
export const CUSTOM_ROUTER_ABI = [
  {
    type: 'function',
    name: 'swapUSDCToETH',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn',     type: 'uint256' },  // USDC 6 desimal
      { name: 'amountOutMin', type: 'uint256' },  // wei (ETH)
      { name: 'to',           type: 'address' }
    ],
    outputs: [{ type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'swapETHToUSDC',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },  // USDC (6 desimal)
      { name: 'to',           type: 'address' }
    ],
    outputs: [{ type: 'uint256' }]
  }
] as const;
