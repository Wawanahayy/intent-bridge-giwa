// src/app/pool/page.tsx
'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import type { Address, ChainKey } from '@/pool/dex/env';
import { addLiquidityV2Tokens, addLiquidityV2WithETH } from '@/pool/dex/liquidity';
import { detectPoolAuto } from '@/pool/dex/detector';


const IRYS_RPC  = (process.env.NEXT_PUBLIC_IRYS_RPC_URL || process.env.NEXT_PUBLIC_RPC_IRYS || '');
const IRYS_CHAIN_ID_HEX = process.env.NEXT_PUBLIC_IRYS_CHAIN_ID_HEX || ''; // e.g. 0x4f6
const ENV_NATIVE = (process.env.NEXT_PUBLIC_NATIVE_SYMBOL_IRYS || 'IRYS').split(',').map(s => s.trim());
const NATIVE_SYMBOL = ENV_NATIVE[0] || 'IRYS';
const WIRYS_ADDR = (process.env.NEXT_PUBLIC_WIRYS_IRYS || '').toLowerCase() as Address | '';
const USDC_ADDR  = (process.env.NEXT_PUBLIC_USDC_IRYS || '').toLowerCase() as Address | '';
const VERIFIED_ENV = (process.env.NEXT_PUBLIC_VERIFIED_TOKENS_IRYS || '').trim();


type EIP1193Provider = {
  request: (args: { method: string; params?: any[] | object }) => Promise<any>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
};
type EIP6963ProviderDetail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: EIP1193Provider;
};
type Ethereumish = EIP1193Provider & { isMetaMask?: boolean; isRabby?: boolean; providers?: EIP1193Provider[] };


const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);
function formatBalance(bi: bigint, decimals: number, maxFrac = 6) {
  const neg = bi < 0n ? '-' : '';
  const abs = neg ? -bi : bi;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac  = abs % base;
  const s = frac.toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  return `${neg}${whole}${s ? '.' + s : ''}`;
}


const ERC20_BALANCEOF = '0x70a08231';
const ERC20_DECIMALS  = '0x313ce567';
const ERC20_SYMBOL    = '0x95d89b41';
function encodeBalanceOf(addr: Address) {
  const pad = addr.replace('0x', '').padStart(64, '0');
  return (ERC20_BALANCEOF + '0'.repeat(24) + pad) as `0x${string}`;
}
function decodeUint(hex: string): bigint {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  return BigInt('0x' + (h || '0'));
}
async function erc20Decimals(provider: EIP1193Provider, token: Address): Promise<number> {
  const res: string = await provider.request({ method: 'eth_call', params: [{ to: token, data: ERC20_DECIMALS }, 'latest'] });
  return Number(decodeUint(res)) || 18;
}
async function erc20Symbol(provider: EIP1193Provider, token: Address): Promise<string> {
  const res: string = await provider.request({ method: 'eth_call', params: [{ to: token, data: ERC20_SYMBOL }, 'latest'] });
  try {
    const raw = res.slice(2);
    const bytes = raw.match(/.{1,2}/g)?.map(h => parseInt(h, 16)) || [];
    const str = new TextDecoder().decode(Uint8Array.from(bytes)).replace(/\u0000+$/g, '');
    return str || 'TOKEN';
  } catch { return 'TOKEN'; }
}
async function erc20BalanceOf(provider: EIP1193Provider, token: Address, owner: Address): Promise<bigint> {
  const res: string = await provider.request({ method: 'eth_call', params: [{ to: token, data: encodeBalanceOf(owner) }, 'latest'] });
  return decodeUint(res);
}


type UToken = {
  id: string; // 'native' | checksum address (lowercased id)
  symbol: string;
  decimals: number;
  kind: 'native' | 'erc20';
  address?: Address;
};
function parseVerifiedFromEnv(): UToken[] {
  const out: UToken[] = [{ id: 'native', symbol: NATIVE_SYMBOL, decimals: 18, kind: 'native' }];
  if (WIRYS_ADDR && isHexAddress(WIRYS_ADDR)) out.push({ id: WIRYS_ADDR, symbol: ENV_NATIVE[1] || 'WIRYS', decimals: 18, kind: 'erc20', address: WIRYS_ADDR });
  if (USDC_ADDR && isHexAddress(USDC_ADDR)) out.push({ id: USDC_ADDR, symbol: 'USDC', decimals: 6, kind: 'erc20', address: USDC_ADDR });


  const chunks = VERIFIED_ENV.split(/[\n,;|]+/).map(s => s.trim()).filter(Boolean);
  for (const c of chunks) {
    const m = c.match(/^([A-Za-z0-9_\-]+)\s*:\s*(0x[a-fA-F0-9]{40})$/);
    if (m) {
      const sym = m[1].toUpperCase();
      const addr = m[2].toLowerCase() as Address;
      if (!out.some(t => t.id === addr)) out.push({ id: addr, symbol: sym, decimals: 18, kind: 'erc20', address: addr });
      continue;
    }
    if (isHexAddress(c)) {
      const addr = c.toLowerCase() as Address;
      if (!out.some(t => t.id === addr)) out.push({ id: addr, symbol: 'TOKEN', decimals: 18, kind: 'erc20', address: addr });
    }
  }
  return out;
}

/** ====== Wallet hook (EIP-6963 + legacy) + ensure chain ====== */
async function ensureIrysChain(p: EIP1193Provider) {
  if (!IRYS_CHAIN_ID_HEX) return;
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: IRYS_CHAIN_ID_HEX }] });
  } catch (e: any) {
    if (e?.code === 4902 && IRYS_RPC) {
      await p.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: IRYS_CHAIN_ID_HEX,
          chainName: 'Irys',
          nativeCurrency: { name: NATIVE_SYMBOL, symbol: NATIVE_SYMBOL, decimals: 18 },
          rpcUrls: [IRYS_RPC],
          blockExplorerUrls: [],
        }],
      });
    } else {
      throw e;
    }
  }
}

function useInjectedWallets() {
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([]);
  const [selected, setSelected] = useState<EIP6963ProviderDetail | null>(null);
  const [account, setAccount] = useState<Address | ''>('');
  const seen = useRef(new Set<string>());

  useEffect(() => {
    function onAnnounce(e: any) {
      const detail: EIP6963ProviderDetail | undefined = e?.detail;
      if (!detail || seen.current.has(detail.info.uuid)) return;
      seen.current.add(detail.info.uuid);
      setProviders((p) => [...p, detail]);
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce as any);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // legacy fallback
    const eth = (window as any).ethereum as Ethereumish | undefined;
    if (eth) {
      const list = Array.isArray(eth.providers) ? eth.providers : [eth];
      list.forEach((prov, i) => {
        const id = `legacy-${i}`;
        if (!seen.current.has(id)) {
          seen.current.add(id);
          setProviders((p) => [
            ...p,
            {
              info: { uuid: id, name: eth.isRabby ? 'Rabby (Injected)' : eth.isMetaMask ? 'MetaMask (Injected)' : 'Injected', icon: '', rdns: 'injected' },
              provider: prov,
            },
          ]);
        }
      });
    }
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce as any);
  }, []);

  async function connect(idx?: number) {
    const target = typeof idx === 'number' ? providers[idx] : providers[0] || null;
    if (!target) throw new Error('No wallet found. Install MetaMask/Rabby.');
    await ensureIrysChain(target.provider);
    const accounts: string[] = await target.provider.request({ method: 'eth_requestAccounts' });
    const a = (accounts?.[0] || '') as Address;
    setSelected(target);
    setAccount(a);
    return a;
  }
  function disconnect() { setSelected(null); setAccount(''); }
  return { providers, selected, account, connect, disconnect };
}


export default function PoolPage() {
  const [chain, setChain] = useState<ChainKey>('irys');
  const { providers, selected, account, connect, disconnect } = useInjectedWallets();

  const [logs, setLogs] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const push = (m: string) => setLogs((p) => [`[${new Date().toLocaleTimeString()}] ${m}`, ...p]);


  const [tokens, setTokens] = useState<UToken[]>(() => parseVerifiedFromEnv());
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [inWallet, setInWallet] = useState<Set<string>>(new Set());


  const [tokenA, setTokenA] = useState<`${string}`>('');
  const [tokenB, setTokenB] = useState<`${string}`>('');
  const [amtA, setAmtA] = useState('1');
  const [amtB, setAmtB] = useState('1');

  // Form: ERC20 + ETH
  const [singleToken, setSingleToken] = useState<`${string}`>('');
  const [amtToken, setAmtToken] = useState('1');
  const [amtEth, setAmtEth] = useState('0.01');


  useEffect(() => {
    (async () => {
      if (!account || !selected?.provider) { setBalances({}); setInWallet(new Set()); return; }
      try {
        const prov = selected.provider;
        const res: Record<string, bigint> = {};
        for (const t of tokens) {
          if (t.kind === 'native') {
            const hex: string = await prov.request({ method: 'eth_getBalance', params: [account, 'latest'] });
            res[t.id] = decodeUint(hex);
          } else if (t.address) {
            res[t.id] = await erc20BalanceOf(prov, t.address, account as Address);
          }
        }
        setBalances(res);
        const present = new Set<string>(Object.entries(res).filter(([,v]) => v > 0n).map(([k]) => k));
        setInWallet(present);
      } catch (e:any) {
        push(`⚠️ Balance detect failed: ${e?.message || e}`);
      }
    })();
  }, [account, selected, tokens]); // eslint-disable-line


  const tokensWithBal = useMemo(() => tokens.map(t => ({...t, bal: balances[t.id] || 0n})), [tokens, balances]);
  const inWalletSorted = useMemo(
    () => tokensWithBal.filter(t => t.kind === 'erc20' && t.bal > 0n)
      .sort((a,b)=> a.bal === b.bal ? a.symbol.localeCompare(b.symbol) : (b.bal > a.bal ? 1 : -1)),
    [tokensWithBal]
  );
  const verifiedSorted = useMemo(
    () => tokensWithBal.filter(t => t.kind === 'erc20' && t.bal === 0n)
      .sort((a,b)=> a.symbol.localeCompare(b.symbol)),
    [tokensWithBal]
  );


  async function detectTokens() {
    try {
      if (!account) throw new Error('Connect wallet first');
      if (!selected?.provider) throw new Error('No provider');
      const prov = selected.provider;

      const before = tokens.length;


      push('🔍 Refreshing verified/wallet tokens…');
      const updated: Record<string, bigint> = { ...balances };
      for (const t of tokens) {
        if (t.kind === 'native') {
          const hex: string = await prov.request({ method: 'eth_getBalance', params: [account, 'latest'] });
          updated[t.id] = decodeUint(hex);
        } else if (t.address) {
          updated[t.id] = await erc20BalanceOf(prov, t.address, account as Address);
        }
      }


      const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const bnHex: string = await prov.request({ method: 'eth_blockNumber', params: [] });
      const bn = Number(decodeUint(bnHex));
      const fromBlock = Math.max(0, bn - 150_000);
      const fromHex = '0x' + fromBlock.toString(16);
      const acctTopic = ('0x' + (account as string).slice(2).toLowerCase().padStart(64, '0')) as `0x${string}`;
      push(`🔎 Scanning logs ~${bn - fromBlock} blocks…`);

      let logsIn: any[] = [], logsOut: any[] = [];
      try {
        logsIn = await prov.request({
          method: 'eth_getLogs',
          params: [{ fromBlock: fromHex, toBlock: 'latest', topics: [TRANSFER_TOPIC, null, acctTopic] }]
        });
      } catch {}
      try {
        logsOut = await prov.request({
          method: 'eth_getLogs',
          params: [{ fromBlock: fromHex, toBlock: 'latest', topics: [TRANSFER_TOPIC, acctTopic, null] }]
        });
      } catch {}

      const cand = new Set<string>();
      [...logsIn, ...logsOut].forEach((l: any) => {
        const addr = (l?.address || '').toLowerCase();
        if (isHexAddress(addr)) cand.add(addr);
      });

      const newly: UToken[] = [];
      for (const addr of cand) {
        if (tokens.some(t => t.id === addr)) continue;
        try {
          const dec = await erc20Decimals(prov, addr as Address);
          const sym = await erc20Symbol(prov, addr as Address);
          const bal = await erc20BalanceOf(prov, addr as Address, account as Address);
          newly.push({ id: addr, symbol: sym || 'TOKEN', decimals: Number(dec) || 18, kind: 'erc20', address: addr as Address });
          updated[addr] = bal;
        } catch {}
      }

      if (newly.length) setTokens(prev => [...prev, ...newly]);
      setBalances(updated);

      const present = new Set<string>(Object.entries(updated).filter(([,v]) => v > 0n).map(([k]) => k));
      setInWallet(present);

      push(`✅ Detected ${present.size} tokens in wallet • added ${newly.length} new token(s) • total listed ${before + newly.length}`);
    } catch (e:any) {
      push(`❌ Detect tokens error: ${e?.message || e}`);
    }
  }


  async function onConnectClick() {
    if (providers.length > 1) { setPickerOpen(true); return; }
    try { const a = await connect(); push(`🔗 Connected: ${a}`); } catch (e:any) { push(`❌ ${e?.message || e}`); }
  }
  async function onPick(idx: number) {
    setPickerOpen(false);
    try { const a = await connect(idx); push(`🔗 Connected: ${a}`); } catch (e:any) { push(`❌ ${e?.message || e}`); }
  }


  const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);

  async function doDetect() {
    try {
      if (!isAddr(tokenA) || !isAddr(tokenB)) throw new Error('TokenA/TokenB invalid');
      const res = await detectPoolAuto({ chain, tokenA: tokenA as Address, tokenB: tokenB as Address });
      if (!res) return push('🔍 Pool/Pair not found (no V3/V2).');
      if (res.kind === 'v3') push(`✅ V3 pool found: ${res.pool} (fee ${res.fee / 10000}%)`);
      else push(`✅ V2 pair found: ${res.pair}`);
    } catch (e:any) {
      push(`❌ ${e?.message || e}`);
    }
  }

  async function addV2Tokens() {
    try {
      if (!account) throw new Error('Wallet not connected');
      if (!isAddr(tokenA) || !isAddr(tokenB)) throw new Error('TokenA/TokenB invalid');
      await addLiquidityV2Tokens({
        chain, account: account as Address,
        tokenA: tokenA as Address, tokenB: tokenB as Address,
        amountADec: amtA, amountBDec: amtB, onLog: push,
      });
    } catch (e:any) {
      push(`❌ ${e?.message || e}`);
    }
  }

  async function addV2WithETH() {
    try {
      if (!account) throw new Error('Wallet not connected');
      if (!isAddr(singleToken)) throw new Error('Token invalid');
      await addLiquidityV2WithETH({
        chain, account: account as Address,
        token: singleToken as Address,
        amountTokenDec: amtToken, amountEthDec: amtEth, onLog: push,
      });
    } catch (e:any) {
      push(`❌ ${e?.message || e}`);
    }
  }


  function setFromSelect(which: 'A'|'B'|'S', id: string) {
    if (!id) return;
    const tok = tokens.find(t => t.id === id);
    if (!tok) return;
    if (tok.kind !== 'erc20' || !tok.address) {
      // Hanya ERC20 yang valid untuk form ini
      push('ℹ️ Pilih ERC20 (bukan native) untuk field ini');
      return;
    }
    if (which === 'A') setTokenA(tok.address);
    else if (which === 'B') setTokenB(tok.address);
    else setSingleToken(tok.address);
  }

  return (
    <div id="pool-root" className="irys-root">
      <div className="wrap">
        <div className="hero">
          <h1>Pool Manager (V2)</h1>
          <p>Add Liquidity untuk pair ERC20-ERC20 atau ERC20-ETH.</p>
        </div>

        <div className="card">
          <div className="grid">
            <div className="col">
              <label className="label">Chain</label>
              <select className="input" value={chain} onChange={() => setChain('irys')}>
                <option value="irys">Irys</option>
              </select>
            </div>
            <div className="col">
              <label className="label">Wallet</label>
              <div className="mono small">
                {selected ? `${selected.info.name}` : '-'} {account ? `• ${account}` : ''}
              </div>
            </div>
          </div>

          <div className="btns" style={{ marginTop: 12 }}>
            {!account ? (
              <button className="btn" onClick={onConnectClick}>Connect Wallet</button>
            ) : (
              <>
                <button className="btn" onClick={disconnect}>Disconnect</button>
                <button className="btn" onClick={detectTokens}>Detect Tokens</button>
              </>
            )}
            <a className="btn" href="/irys">↩ Back to Irys Swap</a>
          </div>
        </div>

        {/* ===== ERC20 + ERC20 ===== */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add Liquidity — ERC20 + ERC20 (V2)</h3>

          <div className="grid">
            <div className="col">
              <label className="label">Token A (select from wallet/verified)</label>
              <select className="input" onChange={(e)=>setFromSelect('A', e.target.value)} value="">
                <option value="" disabled>Pilih token…</option>
                {inWalletSorted.length > 0 && (
                  <optgroup label="In Wallet (sorted by balance)">
                    {inWalletSorted.map(t => (
                      <option key={`wA-${t.id}`} value={t.id}>
                        {t.symbol} — {formatBalance(t.bal, t.decimals)}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Verified">
                  {verifiedSorted.map(t => (
                    <option key={`vA-${t.id}`} value={t.id}>
                      {t.symbol}{t.bal>0n ? ` — ${formatBalance(t.bal, t.decimals)}` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input className="input" style={{marginTop:8}} value={tokenA} onChange={(e) => setTokenA(e.target.value)} placeholder="0x...(ERC20)" />
            </div>

            <div className="col">
              <label className="label">Token B (select from wallet/verified)</label>
              <select className="input" onChange={(e)=>setFromSelect('B', e.target.value)} value="">
                <option value="" disabled>Pilih token…</option>
                {inWalletSorted.length > 0 && (
                  <optgroup label="In Wallet (sorted by balance)">
                    {inWalletSorted.map(t => (
                      <option key={`wB-${t.id}`} value={t.id}>
                        {t.symbol} — {formatBalance(t.bal, t.decimals)}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Verified">
                  {verifiedSorted.map(t => (
                    <option key={`vB-${t.id}`} value={t.id}>
                      {t.symbol}{t.bal>0n ? ` — ${formatBalance(t.bal, t.decimals)}` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input className="input" style={{marginTop:8}} value={tokenB} onChange={(e) => setTokenB(e.target.value)} placeholder="0x...(ERC20)" />
            </div>

            <div className="col">
              <label className="label">Amount A</label>
              <input className="input" value={amtA} onChange={(e) => setAmtA(e.target.value)} />
            </div>
            <div className="col">
              <label className="label">Amount B</label>
              <input className="input" value={amtB} onChange={(e) => setAmtB(e.target.value)} />
            </div>
          </div>

          <div className="btns" style={{ marginTop: 12 }}>
            <button className="btn" onClick={doDetect}>Detect Pool</button>
            <button className="btn" onClick={addV2Tokens}>Add Liquidity</button>
          </div>
        </div>

        {/* ===== ERC20 + ETH ===== */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add Liquidity — ERC20 + ETH (V2)</h3>
          <div className="grid">
            <div className="col">
              <label className="label">Token (select ERC20)</label>
              <select className="input" onChange={(e)=>setFromSelect('S', e.target.value)} value="">
                <option value="" disabled>Pilih token…</option>
                {inWalletSorted.length > 0 && (
                  <optgroup label="In Wallet (sorted by balance)">
                    {inWalletSorted.map(t => (
                      <option key={`wS-${t.id}`} value={t.id}>
                        {t.symbol} — {formatBalance(t.bal, t.decimals)}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Verified">
                  {verifiedSorted.map(t => (
                    <option key={`vS-${t.id}`} value={t.id}>
                      {t.symbol}{t.bal>0n ? ` — ${formatBalance(t.bal, t.decimals)}` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input className="input" style={{marginTop:8}} value={singleToken} onChange={(e) => setSingleToken(e.target.value)} placeholder="0x...(ERC20)" />
            </div>

            <div className="col">
              <label className="label">Amount Token</label>
              <input className="input" value={amtToken} onChange={(e) => setAmtToken(e.target.value)} />
            </div>
            <div className="col">
              <label className="label">Amount ETH</label>
              <input className="input" value={amtEth} onChange={(e) => setAmtEth(e.target.value)} />
            </div>
          </div>
          <div className="btns" style={{ marginTop: 12 }}>
            <button className="btn" onClick={addV2WithETH}>Add Liquidity (ETH)</button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: 0 }}>Logs</h3>
          <pre className="logs mono small">{logs.join('\n')}</pre>
        </div>
      </div>

      {/* Theme hijau sama + picker */}
      <style jsx global>{`
        :root {
          --irys-bg: #17bd86f3;
          --mint-0: rgba(243, 243, 245, 1);
          --mint-1: rgba(248, 246, 246, 1);
          --mint-2: #34d39977;
          --mint-3: #10b981;
          --mint-4: #0ea371;
          --ink-0: #0b3b2a;
          --ink-1: #0e5d43;
          --shadow: 0 8px 28px rgba(16, 185, 129, 0.25);
        }
        html, body, #__next, main, body > div { background: transparent !important; min-height: 100%; }
        .irys-root { isolation: isolate; min-height: 100dvh; position: relative; }
        .irys-root::before { content: ''; position: fixed; inset: 0; background: var(--irys-bg); z-index: -1; }
        * { box-sizing: border-box; }
        .mono { font-family: ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; }
        .small { font-size: 12px; opacity: .9; }

        .btn, .btn:link, .btn:visited {
          display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; min-height: 40px;
          border-radius: 12px; background: var(--mint-3); color: #fff !important; border: 1px solid var(--mint-3);
          font-weight: 600; line-height: 1; cursor: pointer; text-decoration: none;
          box-shadow: 0 6px 18px rgba(16,167,116,.45);
          transition: transform .05s ease, background .15s ease, box-shadow .15s ease, border-color .15s ease;
        }
        .btn:hover { background: var(--mint-4); border-color: var(--mint-4); }
        .btn:active { transform: translateY(1px); }
      `}</style>
      <style jsx>{`
        .wrap { max-width: 960px; margin: 24px auto; padding: 0 16px 80px; color: var(--ink-0); }
        .hero { background: var(--mint-0); border: 1px solid var(--mint-2); border-radius: 14px; padding: 18px 20px; box-shadow: var(--shadow); margin-bottom: 16px; }
        .card { background: var(--mint-0); border: 1px solid var(--mint-2); border-radius: 14px; padding: 16px; margin-bottom: 16px; box-shadow: var(--shadow); }
        .label { font-size: 12px; color: var(--ink-1); margin-bottom: 6px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .col { display: flex; flex-direction: column; }
        .input, select.input { width: 100%; background: var(--mint-1); border: 1px solid var(--mint-2); color: var(--ink-0); border-radius: 10px; padding: 10px 12px; outline: none; }
        .input:focus { border-color: var(--mint-3); box-shadow: 0 0 0 3px rgba(16,185,129,.15); }
        .btns { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .logs { white-space: pre-wrap; background: #0b4336; color: #e7fff6; border: 1px solid #0e614a; border-radius: 12px; padding: 12px; min-height: 80px; }
      `}</style>

      {pickerOpen && (
        <div className="picker">
          <div className="picker-card">
            <h3 style={{ marginTop: 0 }}>Choose a wallet</h3>
            {providers.map((p, i) => (
              <button key={p.info.uuid} className="btn" onClick={() => onPick(i)}>
                <span style={{ width:18, height:18, display:'inline-block', backgroundImage:`url(${p.info.icon})`, backgroundSize:'cover', borderRadius:4, marginRight:8 }} />
                {p.info.name}
              </button>
            ))}
            {providers.length === 0 && <div className="mono small">No wallet detected.</div>}
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setPickerOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
