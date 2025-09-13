// src/app/irys/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { preSwapDetect } from './detect';
import { swapUSDCtoETH, swapETHtoUSDC } from './swap-irys';


type Address = `0x${string}`;
type SwapDir = 'USDC_TO_ETH' | 'ETH_TO_USDC';

type UToken = {
  id: string;                 
  symbol: string;
  decimals: number;
  kind: 'native' | 'erc20';
  address?: Address;
};

/** ===== ENV literals ===== */
const IRYS_RPC = (process.env.NEXT_PUBLIC_IRYS_RPC_URL || process.env.NEXT_PUBLIC_RPC_IRYS || '');
const IRYS_CHAIN_ID_HEX = process.env.NEXT_PUBLIC_IRYS_CHAIN_ID_HEX || ''; // e.g. "0x4f6"
const ENV_NATIVE = (process.env.NEXT_PUBLIC_NATIVE_SYMBOL_IRYS || 'IRYS').split(',').map(s => s.trim());
const NATIVE_SYMBOL = ENV_NATIVE[0] || 'IRYS';
const WIRYS_ADDR = (process.env.NEXT_PUBLIC_WIRYS_IRYS || '').toLowerCase() as Address | '';
const USDC_ADDR_RAW = (process.env.NEXT_PUBLIC_USDC_IRYS || '').trim().toLowerCase(); // <- RAW string
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
              info: {
                uuid: id,
                name: eth.isRabby ? 'Rabby (Injected)' : eth.isMetaMask ? 'MetaMask (Injected)' : 'Injected',
                icon: '',
                rdns: 'injected',
              },
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


const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);
function formatBalance(bi: bigint, decimals: number) {
  const neg = bi < 0n ? '-' : '';
  const s = (neg ? -bi : bi).toString().padStart(decimals + 1, '0');
  const i = s.slice(0, -decimals) || '0';
  const f = s.slice(-decimals).replace(/0+$/, '');
  return `${neg}${i}${f ? '.' + f : ''}`;
}
function parseVerifiedFromEnv(): UToken[] {
  const out: UToken[] = [];
  out.push({ id: 'native', symbol: NATIVE_SYMBOL, decimals: 18, kind: 'native' });
  if (WIRYS_ADDR && isHexAddress(WIRYS_ADDR)) {
    out.push({ id: WIRYS_ADDR, symbol: ENV_NATIVE[1] || 'WIRYS', decimals: 18, kind: 'erc20', address: WIRYS_ADDR });
  }
  if (USDC_ADDR_RAW && isHexAddress(USDC_ADDR_RAW)) {
    const addr = USDC_ADDR_RAW as Address;
    out.push({ id: addr, symbol: 'USDC', decimals: 6, kind: 'erc20', address: addr });
  }

  const chunks = VERIFIED_ENV.split(/[\n;|,]+/).map(s => s.trim()).filter(Boolean);
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
function dirFromPair(from: UToken, to: UToken): SwapDir | null {
  const isNative = (t: UToken) => t.kind === 'native';
  const isUSDC   = (t: UToken) => t.symbol.toUpperCase() === 'USDC';
  if (!from || !to) return null;
  if (!isNative(from) && isUSDC(from) && isNative(to)) return 'USDC_TO_ETH';
  if (isNative(from) && isUSDC(to)) return 'ETH_TO_USDC';
  return null;
}

// === ERC20 minimal via eth_call ===
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
  const data = ERC20_DECIMALS;
  const res: string = await provider.request({ method: 'eth_call', params: [{ to: token, data }, 'latest'] });
  return Number(decodeUint(res)) || 18;
}
async function erc20Symbol(provider: EIP1193Provider, token: Address): Promise<string> {
  const data = ERC20_SYMBOL;
  const res: string = await provider.request({ method: 'eth_call', params: [{ to: token, data }, 'latest'] });
  try {
    const raw = res.slice(2);
    const bytes = raw.match(/.{1,2}/g)?.map(h => parseInt(h, 16)) || [];
    const str = new TextDecoder().decode(Uint8Array.from(bytes)).replace(/\u0000+$/g, '');
    return str || 'TOKEN';
  } catch { return 'TOKEN'; }
}
async function erc20BalanceOf(provider: EIP1193Provider, token: Address, owner: Address): Promise<bigint> {
  const data = encodeBalanceOf(owner);
  const res: string = await provider.request({ method: 'eth_call', params: [{ to: token, data }, 'latest'] });
  return decodeUint(res);
}


export default function IrysDexPage() {
  const { providers, selected, account, connect, disconnect } = useInjectedWallets();

  const [tokens, setTokens] = useState<UToken[]>(() => parseVerifiedFromEnv());
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [inWallet, setInWallet] = useState<Set<string>>(new Set());

  const [fromId, setFromId] = useState<string>(() => parseVerifiedFromEnv()[0]?.id ?? 'native');
  const [toId, setToId]     = useState<string>(() => parseVerifiedFromEnv()[1]?.id ?? 'native');

  const [amount, setAmount] = useState<string>('1');
  const [recipient, setRecipient] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [routeInfo, setRouteInfo] = useState<null | { kind: 'v3'|'v2'; addr: string; fee?: number }>(null);
  const [customAddr, setCustomAddr] = useState<string>('');

  const push = (m: string) => setLogs((p) => [`[${new Date().toLocaleTimeString()}] ${m}`, ...p]);

  const fromTok = useMemo(() => tokens.find(t => t.id === fromId)!, [tokens, fromId]);
  const toTok   = useMemo(() => tokens.find(t => t.id === toId)!,   [tokens, toId]);
  const direction = useMemo(() => dirFromPair(fromTok, toTok), [fromTok, toTok]);

  const compiled = useMemo(() => ({
    mode: 'SWAP_ONLY',
    chain: 'irys',
    pair: { from: fromTok?.symbol, to: toTok?.symbol },
    to: (recipient && isHexAddress(recipient) ? (recipient as Address) : ''),
    amountIn: amount,
    route: routeInfo
      ? [routeInfo.kind === 'v3' ? `V3:${routeInfo.addr} fee=${((routeInfo.fee||0)/10000).toFixed(2)}%` : `V2:${routeInfo.addr}`]
      : ['(not detected)'],
  }), [fromTok, toTok, recipient, amount, routeInfo]);


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


        if (!(res[fromId] > 0n)) {
          const richest = [...tokens]
            .map(t => ({ t, bal: res[t.id] || 0n }))
            .sort((a,b)=> (b.bal > a.bal ? 1 : -1))[0]?.t;
          if (richest) setFromId(richest.id);
        }
      } catch (e:any) {
        push(`⚠️ Balance detect failed: ${e?.message || e}`);
      }
    })();
  }, [account, selected, tokens]); // eslint-disable-line


  const tokensWithBal = useMemo(() => tokens.map(t => ({...t, bal: balances[t.id] || 0n})), [tokens, balances]);
  const inWalletSorted = useMemo(
    () => tokensWithBal.filter(t => t.bal > 0n).sort((a,b) => a.bal === b.bal ? a.symbol.localeCompare(b.symbol) : (b.bal > a.bal ? 1 : -1)),
    [tokensWithBal]
  );
  const verifiedSorted = useMemo(
    () => tokensWithBal.filter(t => t.bal === 0n).sort((a,b)=> a.symbol.localeCompare(b.symbol)),
    [tokensWithBal]
  );

  function ensureDifferent(aId: string, bId: string) {
    if (aId === bId) {
      const other = tokens.find(t => t.id !== aId)?.id;
      return other || bId;
    }
    return bId;
  }

  async function onConnectClick() {
    if (providers.length > 1) { setPickerOpen(true); return; }
    try { await connect(); push('🔗 Connected'); } catch (e:any) { push(`❌ ${e?.message || e}`); }
  }
  async function onPick(idx: number) {
    setPickerOpen(false);
    try { await connect(idx); push('🔗 Connected'); } catch (e:any) { push(`❌ ${e?.message || e}`); }
  }

  async function addCustomToken() {
    try {
      const raw = customAddr.trim().toLowerCase();
      if (!isHexAddress(raw)) throw new Error('Invalid contract (0x + 40 hex)');
      if (tokens.some(t => t.id === raw)) { push('ℹ️ Token already in the list'); return; }

      let dec = 18, sym = 'TOKEN';
      if (!selected?.provider) {
        push('ℹ️ Not connected: using defaults (18/TOKEN). Connect to fetch metadata.');
      } else {
        try { dec = await erc20Decimals(selected.provider, raw as Address); } catch {}
        try { sym = await erc20Symbol(selected.provider, raw as Address); } catch {}
      }

      const tok: UToken = { id: raw, symbol: sym || 'TOKEN', decimals: Number(dec) || 18, kind:'erc20', address: raw as Address };
      setTokens((prev) => [...prev, tok]);
      push(`➕ Added ${tok.symbol}`);

      if (account && selected?.provider) {
        const bal = await erc20BalanceOf(selected.provider, raw as Address, account as Address);
        setBalances((b) => ({ ...b, [raw]: bal }));
        if (bal > 0n) setInWallet((w) => new Set([...w, raw]));
      }
      setCustomAddr('');
    } catch (e:any) {
      push(`❌ Add token error: ${e?.message || e}`);
    }
  }


  async function detectTokens() {
    try {
      if (!account) throw new Error('Connect wallet first');
      if (!selected?.provider) throw new Error('No provider');

      const prov = selected.provider;
      const beforeCount = tokens.length;


      push('🔍 Checking verified tokens balances…');
      const updatedBalances: Record<string, bigint> = { ...balances };
      for (const t of tokens) {
        if (t.kind === 'native') {
          const hex: string = await prov.request({ method: 'eth_getBalance', params: [account, 'latest'] });
          updatedBalances[t.id] = decodeUint(hex);
        } else if (t.address) {
          updatedBalances[t.id] = await erc20BalanceOf(prov, t.address, account as Address);
        }
      }

 
      const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const bnHex: string = await prov.request({ method: 'eth_blockNumber', params: [] });
      const bn = Number(decodeUint(bnHex));
      const fromBlock = Math.max(0, bn - 150_000);
      const fromHex = '0x' + fromBlock.toString(16);
      const acctTopic = ('0x' + account.slice(2).toLowerCase().padStart(64, '0')) as `0x${string}`;

      push(`🔎 Scanning Transfer logs ~${bn - fromBlock} blocks…`);
      let logsIn: any[] = [];
      let logsOut: any[] = [];
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

      const candAddrs = new Set<string>();
      [...logsIn, ...logsOut].forEach((l: any) => {
        const addr = (l?.address || '').toLowerCase();
        if (isHexAddress(addr)) candAddrs.add(addr);
      });

      const newlyAdded: UToken[] = [];
      for (const addr of candAddrs) {
        if (tokens.some(t => t.id === addr)) continue;
        try {
          const dec = await erc20Decimals(prov, addr as Address);
          const sym = await erc20Symbol(prov, addr as Address);
          const bal = await erc20BalanceOf(prov, addr as Address, account as Address);
          const tok: UToken = { id: addr, symbol: sym || 'TOKEN', decimals: Number(dec) || 18, kind: 'erc20', address: addr as Address };
          newlyAdded.push(tok);
          updatedBalances[addr] = bal;
        } catch {
          // non-ERC20? skip
        }
      }

      if (newlyAdded.length) {
        setTokens(prev => [...prev, ...newlyAdded]);
      }
      setBalances(updatedBalances);

      const present = new Set<string>(Object.entries(updatedBalances).filter(([,v]) => v > 0n).map(([k]) => k));
      setInWallet(present);

      const afterCount = beforeCount + newlyAdded.length;
      push(`✅ Detected ${present.size} tokens in wallet • added ${newlyAdded.length} new token(s) from logs • total listed ${afterCount}`);
    } catch (e:any) {
      push(`❌ Detect tokens error: ${e?.message || e}`);
    }
  }

  async function detectRoute() {
    try {
      setRouteInfo(null);
      if (!direction) { push('ℹ️ Unsupported pair (only USDC ↔ Native supported)'); return; }
      const info = await preSwapDetect(direction);
      if (info.route) {
        setRouteInfo({ kind: info.route.kind as 'v3'|'v2', addr: info.route.addr as string, fee: (info.route as any).fee });
        push(info.route.kind === 'v3'
          ? `✅ V3 ${info.route.addr} fee ${((info.route as any).fee/10000).toFixed(2)}%`
          : `✅ V2 ${info.route.addr}`);
      } else {
        push('ℹ️ No factory set: pool detect skipped');
      }
    } catch (e:any) {
      push(`❌ Detect error: ${e?.message || e}`);
    }
  }

  async function executeSwap() {
    try {
      if (!account) throw new Error('Connect wallet first');
      if (!direction) throw new Error('Unsupported pair (only USDC ↔ Native supported)');

      push('🔎 Detecting contracts & route…');
      await detectRoute();

      if (direction === 'USDC_TO_ETH') {
        await swapUSDCtoETH({ account: account as Address, amountUsdc: amount, onLog: push });
      } else {
        await swapETHtoUSDC({ account: account as Address, amountEth: amount, onLog: push });
      }
    } catch (e:any) {
      push(`❌ Swap error: ${e?.message || e}`);
    }
  }

  return (
    <div id="irys-root" className="irys-root">
      <div className="wrap">
        <div className="hero">
          <div className="hero-top">
            <div className="title">
              <h1>Irys DEX (Testnet)</h1>
              <p>Swap USDC ⇄ Native via Custom Router (Irys)</p>
            </div>
            <Link href="/pool" prefetch={false} className="btn">➕ Add Liquidity</Link>
          </div>
        </div>

        <div className="card">
          <div className="grid">
            <div className="col">
              <label className="label">From</label>
              <select
                className="input"
                value={fromId}
                onChange={(e) => { const v = e.target.value; setFromId(v); setToId(ensureDifferent(v, toId)); }}
              >
                {inWalletSorted.length > 0 && (
                  <optgroup label="In Wallet (sorted by balance)">
                    {inWalletSorted.map(t => (
                      <option key={`w-${t.id}`} value={t.id}>
                        {t.symbol} — {formatBalance(t.bal, t.decimals)}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Verified">
                  {verifiedSorted.map(t => (
                    <option key={`v-${t.id}`} value={t.id}>
                      {t.symbol}{t.bal>0n ? ` — ${formatBalance(t.bal, t.decimals)}` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="col">
              <label className="label">To</label>
              <select
                className="input"
                value={toId}
                onChange={(e) => setToId(ensureDifferent(fromId, e.target.value))}
              >
                {inWalletSorted.length > 0 && (
                  <optgroup label="In Wallet (sorted by balance)">
                    {inWalletSorted.filter(t => t.id !== fromId).map(t => (
                      <option key={`w2-${t.id}`} value={t.id}>
                        {t.symbol} — {formatBalance(t.bal, t.decimals)}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Verified">
                  {verifiedSorted.filter(t => t.id !== fromId).map(t => (
                    <option key={`v2-${t.id}`} value={t.id}>
                      {t.symbol}{t.bal>0n ? ` — ${formatBalance(t.bal, t.decimals)}` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="col span2">
              <label className="label">Amount</label>
              <input className="input" value={amount} onChange={(e)=>setAmount(e.target.value)} />
            </div>
          </div>

          <div className="grid" style={{ marginTop: 10 }}>
            <div className="col">
              <label className="label">Add token by contract</label>
              <div style={{ display:'flex', gap:8 }}>
                <input className="input" placeholder="0x..." value={customAddr} onChange={e=>setCustomAddr(e.target.value)} />
                <button className="btn" onClick={addCustomToken}>Add</button>
              </div>
              <div className="mini" style={{marginTop:6,opacity:.8}}>
                Tip: klik <b>Detect Tokens</b> untuk scan token dari wallet & verified list.
              </div>
            </div>

            <div className="col">
              <label className="label">Recipient (optional)</label>
              <input className="input" placeholder="0x... (default: sender)" value={recipient} onChange={(e)=>setRecipient(e.target.value)} />
            </div>
          </div>

          <div className="btns" style={{ marginTop: 12 }}>
            {!account ? (
              <button className="btn" onClick={onConnectClick}>Connect Wallet</button>
            ) : (
              <>
                <button className="btn" onClick={disconnect}>Disconnect</button>
                <button className="btn" onClick={detectTokens}>Detect Tokens</button>
                <button className="btn" onClick={detectRoute} disabled={!direction}>Detect Route</button>
                <button className="btn" onClick={executeSwap} disabled={!direction}>Execute Swap</button>
              </>
            )}
          </div>

          <div className="label" style={{ marginTop: 8 }}>Compiled Intent JSON</div>
          <pre className="pre">{JSON.stringify(compiled, null, 2)}</pre>
        </div>

        <div className="card">
          <h3 style={{ margin: 0 }}>Wallet</h3>
          <div className="grid">
            <div className="col span2">
              <div className="mini">Provider</div>
              <div className="mono">{selected ? `${selected.info.name}` : '-'}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: 0 }}>Logs</h3>
          <div className="logs mono small">{logs.join('\n')}</div>
        </div>
      </div>

      {/* Picker */}
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

      {/* THEME */}
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
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; }
        .small { font-size: 12px; opacity: 0.9; }
        .mini { font-size: 12px; opacity: 0.75; }

        .btn, .btn:link, .btn:visited {
          display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; min-height: 40px;
          border-radius: 12px; background: var(--mint-3); color: #fff !important; border: 1px solid var(--mint-3);
          font-weight: 600; line-height: 1; cursor: pointer; text-decoration: none;
          box-shadow: 0 6px 18px rgba(16, 167, 116, 0.45);
          transition: transform .05s ease, background .15s ease, box-shadow .15s ease, border-color .15s ease;
        }
        .btn:hover { background: var(--mint-4); border-color: var(--mint-4); }
        .btn:active { transform: translateY(1px); }
      `}</style>

      <style jsx>{`
        .wrap { max-width: 960px; margin: 24px auto; padding: 0 16px 80px; color: var(--ink-0); }
        .hero { background: var(--mint-0); border: 1px solid var(--mint-2); border-radius: 14px; padding: 16px 16px; box-shadow: var(--shadow); margin-bottom: 16px; }
        .hero-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .title h1 { margin: 0 0 6px; }
        .title p { margin: 0; opacity: 0.9; }
        .card { background: var(--mint-0); border: 1px solid var(--mint-2); border-radius: 14px; padding: 16px; margin-bottom: 16px; box-shadow: var(--shadow); }
        .label { font-size: 12px; color: var(--ink-1); margin-bottom: 6px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .col { display: flex; flex-direction: column; }
        .span2 { grid-column: span 2; }
        .input, select.input { width: 100%; background: var(--mint-1); border: 1px solid var(--mint-2); color: var(--ink-0); border-radius: 10px; padding: 10px 12px; outline: none; }
        .input::placeholder { color: var(--ink-1); opacity: 0.6; }
        .input:focus { border-color: var(--mint-3); box-shadow: 0 0 0 3px rgba(16,185,129,.15); }
        .btns { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
        .pre { margin-top: 8px; background: #083e2f; color: #eafff6; border: 1px solid #0e614a; border-radius: 12px; padding: 12px; max-height: 420px; overflow: auto; }
        .logs { white-space: pre-wrap; background: #0b4336; color: #e7fff6; border: 1px solid #0e614a; border-radius: 12px; padding: 12px; min-height: 80px; }
        .picker { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: grid; place-items: center; z-index: 20; }
        .picker-card { background: var(--mint-0); border: 1px solid var(--mint-2); border-radius: 14px; padding: 16px; min-width: 280px; box-shadow: var(--shadow); display: grid; gap: 10px; }
      `}</style>
    </div>
  );
}
