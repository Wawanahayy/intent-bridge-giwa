"use client";
const kv = (k: string, v: any) => `${k} = ${v ?? "(undefined)"}`;
export default function EnvPage(){
  const env = {
    NEXT_PUBLIC_RPC_SEPOLIA: process.env.NEXT_PUBLIC_RPC_SEPOLIA,
    NEXT_PUBLIC_RPC_GIWA: process.env.NEXT_PUBLIC_RPC_GIWA,
    NEXT_PUBLIC_RPC_BASE: process.env.NEXT_PUBLIC_RPC_BASE,
    NEXT_PUBLIC_USDC_SEPOLIA: process.env.NEXT_PUBLIC_USDC_SEPOLIA,
    NEXT_PUBLIC_USDC_BASE: process.env.NEXT_PUBLIC_USDC_BASE,
    NEXT_PUBLIC_CCTP_TOKEN_MESSENGER: process.env.NEXT_PUBLIC_CCTP_TOKEN_MESSENGER,
    NEXT_PUBLIC_CCTP_MESSAGE_TRANSMITTER: process.env.NEXT_PUBLIC_CCTP_MESSAGE_TRANSMITTER,
    NEXT_PUBLIC_CCTP_DOMAIN_SEPOLIA: process.env.NEXT_PUBLIC_CCTP_DOMAIN_SEPOLIA,
    NEXT_PUBLIC_WETH_SEPOLIA: process.env.NEXT_PUBLIC_WETH_SEPOLIA,
    NEXT_PUBLIC_UNISWAP_V3_ROUTER_SEPOLIA: process.env.NEXT_PUBLIC_UNISWAP_V3_ROUTER_SEPOLIA
  };
  return (
    <div className="card">
      <h2>ENV (client)</h2>
      <pre className="mono small" style={{whiteSpace:"pre-wrap"}}>
{Object.entries(env).map(([k,v])=>kv(k,v)).join("\n")}
      </pre>
      <p className="small">Jika (undefined), berarti Next belum memuat ENV tsb. Pastikan .env.local di root & restart dev server.</p>
    </div>
  );
}
