export const env = (k: string, d?: string) => (process.env as any)[k] ?? d ?? '';

export const getRpcSepolia = () =>
  env('NEXT_PUBLIC_RPC_SEPOLIA', 'https://sepolia.drpc.org');

export const getUsdcSepolia = () =>
  env('NEXT_PUBLIC_USDC_SEPOLIA', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238') as `0x${string}`;

export const getCustomRouterSepolia = () =>
  env('NEXT_PUBLIC_CUSTOM_ROUTER_SEPOLIA', '0x6e34AE9C414aa726DbBAf98b1686CB8fe43b8EAb') as `0x${string}`;
