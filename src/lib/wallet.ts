'use client';

import type { Address } from 'viem';

export function getInjectedProvider(): any {
  const w = window as any;
  if (w.ethereum) return w.ethereum;
  let picked: any;
  const onAnnounce = (e:any) => { if (!picked && e?.detail?.provider) picked = e.detail.provider; };
  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // synchronous fallback – kalau tidak ada, lempar error
  window.removeEventListener('eip6963:announceProvider', onAnnounce);
  if (picked) return picked;
  throw new Error("Wallet not found. Install/enable a wallet extension.");
}

export async function ensureChain(chainIdHex: string, addParams?: any) {
  const eth = getInjectedProvider();
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }]});
  } catch (e:any) {
    if (e?.code === 4902 && addParams) {
      await eth.request({ method: "wallet_addEthereumChain", params: [addParams] });
    } else {
      throw e;
    }
  }
}

export async function connectWallet(): Promise<Address> {
  const eth = getInjectedProvider();
  const existing: string[] = await eth.request({ method: "eth_accounts" });
  if (existing && existing[0]) return existing[0] as Address;
  const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
  if (!accounts[0]) throw new Error("No account returned from wallet");
  return accounts[0] as Address;
}

export function createLock() {
  let locked = false;
  return {
    isLocked: () => locked,
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (locked) throw new Error("Another request is in progress");
      locked = true;
      try { return await fn(); }
      finally { locked = false; }
    }
  };
}
