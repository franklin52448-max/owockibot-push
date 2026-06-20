const WALLET = '0x26B7805Dd8aEc26DA55fc8e0c659cf6822b740Be';
const WALLET_LOW = WALLET.toLowerCase();

const CHAINS = {
  base: {
    name: 'Base',
    rpc: 'https://mainnet.base.org',
    icon: '🔵',
    cssClass: 'chain-base',
    badgeClass: 'badge-base',
    explorer: 'https://basescan.org',
    chainId: 8453,
    nativeSymbol: 'ETH',
    tokens: [
      { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
      { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
      { symbol: 'OWOCKIBOT', address: '0xfdc933ff4e2980d18becf48e4e030d8463a2bb07', decimals: 18 },
    ]
  },
  ethereum: {
    name: 'Ethereum',
    rpc: 'https://ethereum-rpc.publicnode.com',
    icon: '💜',
    cssClass: 'chain-ethereum',
    badgeClass: 'badge-ethereum',
    explorer: 'https://etherscan.io',
    chainId: 1,
    nativeSymbol: 'ETH',
    tokens: [
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
      { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    ]
  },
  optimism: {
    name: 'Optimism',
    rpc: 'https://optimism-rpc.publicnode.com',
    icon: '🔴',
    cssClass: 'chain-optimism',
    badgeClass: 'badge-optimism',
    explorer: 'https://optimistic.etherscan.io',
    chainId: 10,
    nativeSymbol: 'ETH',
    tokens: [
      { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D0a0fA8d2f6e8c8e0fE3e', decimals: 6 },
      { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
      { symbol: 'USDT', address: '0x94b008aA00579c1307B0EF2c499AD98a8a4a6E0D', decimals: 6 },
    ]
  },
  arbitrum: {
    name: 'Arbitrum',
    rpc: 'https://arbitrum-one-rpc.publicnode.com',
    icon: '🔷',
    cssClass: 'chain-arbitrum',
    badgeClass: 'badge-arbitrum',
    explorer: 'https://arbiscan.io',
    chainId: 42161,
    nativeSymbol: 'ETH',
    tokens: [
      { symbol: 'USDC', address: '0xaf88d06567e65abc3f1b2ad06c6b6b0fb9843c19', decimals: 6 },
      { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
      { symbol: 'USDT', address: '0xFd086b7Ae7ee1947a8EEf5E8e0E4E3a3F4e7c7f4', decimals: 6 },
    ]
  }
};

let activeChain = 'all';
let state = { chains: {}, tokens: [], txs: [], ethPrice: 0, owockiPrice: 0, isLive: false };
let isLoading = false;
let fetchError = null;

function hexToBigInt(hex) {
  if (!hex || hex === '0x' || hex === '0x0') return 0n;
  return BigInt(hex);
}

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'RPC error');
  return json.result;
}

async function getNativeBalance(chainKey) {
  try {
    const result = await rpcCall(CHAINS[chainKey].rpc, 'eth_getBalance', [WALLET, 'latest']);
    return result ? Number(hexToBigInt(result)) / 1e18 : 0;
  } catch (e) {
    console.warn(`Native balance ${chainKey} failed:`, e.message);
    return 0;
  }
}

async function getTokenBalance(chainKey, token) {
  try {
    const data = '0x70a08231' + WALLET_LOW.slice(2).padStart(64, '0');
    const result = await rpcCall(CHAINS[chainKey].rpc, 'eth_call', [{ to: token.address, data }, 'latest']);
    if (!result || result === '0x' || result === '0x0') return 0;
    const raw = hexToBigInt(result);
    return Number(raw) / (10 ** token.decimals);
  } catch (e) {
    console.warn(`Token ${token.symbol} ${chainKey} failed:`, e.message);
    return 0;
  }
}

async function getPrices() {
  let ethPrice = 0;
  let owockiPrice = 0;
  
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006');
    if (res.ok) {
      const json = await res.json();
      const pair = json?.pairs?.find(p => p.chainId === 'base') || json?.pairs?.[0];
      if (pair) ethPrice = parseFloat(pair.priceUsd) || 0;
    }
  } catch (e) { console.warn('WETH price fetch failed:', e.message); }
  
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/0xfdc933ff4e2980d18becf48e4e030d8463a2bb07');
    if (res.ok) {
      const json = await res.json();
      const pair = json?.pairs?.find(p => p.chainId === 'base') || json?.pairs?.[0];
      if (pair) owockiPrice = parseFloat(pair.priceUsd) || 0;
    }
  } catch (e) { console.warn('OWOCKIBOT price fetch failed:', e.message); }
  
  return { ethPrice, owockiPrice };
}

async function getTransactions(chainKey) {
  const chain = CHAINS[chainKey];
  try {
    if (chainKey === 'base') {
      const res = await fetch(`https://base.blockscout.com/api/v2/addresses/${WALLET}/transactions?filter=to%7Cfrom&page=1&page_size=5`);
      if (!res.ok) return [];
      const json = await res.json();
      if (json.items) {
        return json.items.map(tx => ({
          chain: chainKey,
          chainName: chain.name,
          hash: tx.hash,
          from: tx.from?.hash,
          to: tx.to?.hash,
          value: Number(BigInt(tx.value || '0')) / 1e18,
          timeStamp: new Date(tx.timestamp).getTime() / 1000,
          type: tx.from?.hash?.toLowerCase() === WALLET_LOW ? 'out' : 'in',
          explorerUrl: `${chain.explorer}/tx/${tx.hash}`
        }));
      }
    } else {
      // Use public explorer APIs for other chains
      const explorerUrls = {
        ethereum: `https://api.etherscan.io/api?module=account&action=txlist&address=${WALLET}&sort=desc&page=1&offset=5`,
        optimism: `https://api-optimistic.etherscan.io/api?module=account&action=txlist&address=${WALLET}&sort=desc&page=1&offset=5`,
        arbitrum: `https://api.arbiscan.io/api?module=account&action=txlist&address=${WALLET}&sort=desc&page=1&offset=5`
      };
      const res = await fetch(explorerUrls[chainKey]);
      if (!res.ok) return [];
      const json = await res.json();
      if (Array.isArray(json?.result)) {
        return json.result.filter(tx => tx.hash).map(tx => ({
          chain: chainKey,
          chainName: chain.name,
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: Number(BigInt(tx.value || '0')) / 1e18,
          timeStamp: parseInt(tx.timeStamp || '0'),
          type: tx.from?.toLowerCase() === WALLET_LOW ? 'out' : 'in',
          explorerUrl: `${chain.explorer}/tx/${tx.hash}`
        }));
      }
    }
    return [];
  } catch (e) {
    console.warn(`Transactions ${chainKey} failed:`, e.message);
    return [];
  }
}

async function fetchAllData() {
  isLoading = true;
  fetchError = null;
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.disabled = true;
  render();
  
  try {
    // 1. Get prices first
    const { ethPrice, owockiPrice } = await getPrices();
    state.ethPrice = ethPrice;
    state.owockiPrice = owockiPrice;
    state.isLive = (ethPrice > 0);
    
    // 2. Fetch all chain data in parallel
    const chainKeys = Object.keys(CHAINS);
    const chainResults = await Promise.all(chainKeys.map(async (key) => {
      const nativeBal = await getNativeBalance(key);
      const tokenResults = await Promise.all(
        CHAINS[key].tokens.map(t => getTokenBalance(key, t).then(bal => ({ ...t, balance: bal, chain: key })))
      );
      const txs = await getTransactions(key);
      return { key, nativeBal, tokens: tokenResults, txs };
    }));
    
    // 3. Build state
    state.chains = {};
    state.tokens = [];
    state.txs = [];
    
    for (const cr of chainResults) {
      const nativeUsd = cr.nativeBal * ethPrice;
      state.chains[cr.key] = {
        nativeBal: cr.nativeBal,
        nativeUsd,
        tokenCount: cr.tokens.filter(t => t.balance > 0).length
      };
      
      for (const t of cr.tokens) {
        let price = 0;
        if (t.symbol === 'USDC' || t.symbol === 'USDT') price = 1;
        else if (t.symbol === 'WETH' || t.symbol === 'ETH') price = ethPrice;
        else if (t.symbol === 'OWOCKIBOT') price = owockiPrice;
        
        t.usdValue = t.balance * price;
        t.price = price;
        if (t.balance > 0) state.tokens.push(t);
      }
      
      state.txs.push(...cr.txs);
    }
    
    state.tokens.sort((a, b) => b.usdValue - a.usdValue);
    state.txs.sort((a, b) => b.timeStamp - a.timeStamp);
    state.txs = state.txs.slice(0, 20);
    
  } catch (e) {
    console.error('Fetch error:', e);
    fetchError = e.message;
  }
  
  isLoading = false;
  if (btn) btn.disabled = false;
  render();
  document.getElementById('lastUpdated').textContent = 
    state.isLive ? `Live: ${new Date().toLocaleTimeString()}` : `Updated: ${new Date().toLocaleTimeString()}`;
}

window.toggleChain = function(chain) {
  activeChain = chain;
  document.querySelectorAll('.chain-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.chain === chain);
  });
  render();
};

window.refresh = function() {
  fetchAllData();
};

function formatNum(n, decimals = 2) {
  if (n === 0) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
  if (n < 0.01 && n > 0) return n.toFixed(8);
  return n.toFixed(decimals);
}

function formatUsd(n) {
  if (n === 0) return '$0.00';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function render() {
  const visibleChains = activeChain === 'all' ? Object.keys(CHAINS) : [activeChain];
  
  let total = 0;
  for (const key of visibleChains) {
    total += (state.chains[key]?.nativeUsd || 0);
    total += state.tokens.filter(t => t.chain === key).reduce((sum, t) => sum + t.usdValue, 0);
  }
  document.getElementById('totalValue').textContent = isLoading ? 'Loading...' : formatUsd(total);
  
  const liveBadge = document.getElementById('liveBadge');
  if (liveBadge) {
    if (isLoading) { liveBadge.textContent = '⏳'; liveBadge.style.color = '#f59e0b'; }
    else if (state.isLive) { liveBadge.textContent = '🟢 LIVE'; liveBadge.style.color = '#008456'; }
    else { liveBadge.textContent = '📷 SNAPSHOT'; liveBadge.style.color = '#72767d'; }
  }
  
  const cardsEl = document.getElementById('chainCards');
  if (isLoading && Object.keys(state.chains).length === 0) {
    cardsEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  } else {
    let cardsHtml = '';
    for (const key of visibleChains) {
      const c = state.chains[key];
      const chain = CHAINS[key];
      if (!c) continue;
      cardsHtml += `
        <div class="chain-card ${chain.cssClass}">
          <div class="chain-header">
            <div class="chain-icon">${chain.icon}</div>
            <div class="chain-name">${chain.name}</div>
          </div>
          <div class="balance">${formatNum(c.nativeBal, 6)} ${chain.nativeSymbol}</div>
          <div class="balance-usd">${formatUsd(c.nativeUsd)}</div>
          <div class="token-count">${c.tokenCount} token${c.tokenCount !== 1 ? 's' : ''} held</div>
        </div>`;
    }
    cardsEl.innerHTML = cardsHtml || '<div class="no-data">No chain data</div>';
  }
  
  const tokenEl = document.getElementById('tokenTable');
  if (isLoading && state.tokens.length === 0) {
    tokenEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  } else {
    const visibleTokens = state.tokens.filter(t => visibleChains.includes(t.chain));
    if (visibleTokens.length === 0) {
      tokenEl.innerHTML = '<div class="no-data">No token holdings found</div>';
    } else {
      tokenEl.innerHTML = visibleTokens.map(t => `
        <div class="token-row">
          <div class="token-name">${t.symbol} <span class="token-chain-badge ${CHAINS[t.chain].badgeClass}">${CHAINS[t.chain].name}</span></div>
          <div class="token-balance">${formatNum(t.balance, t.decimals > 6 ? 2 : t.decimals)}</div>
          <div class="token-value">${formatUsd(t.usdValue)}</div>
          <div style="text-align:right;font-size:0.75rem;color:#72767d">@ ${t.price < 0.01 ? formatNum(t.price, 10) : formatUsd(t.price)}</div>
        </div>`).join('');
    }
  }
  
  const txEl = document.getElementById('txTable');
  if (isLoading && state.txs.length === 0) {
    txEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  } else {
    const visibleTxs = state.txs.filter(tx => visibleChains.includes(tx.chain));
    if (visibleTxs.length === 0) {
      txEl.innerHTML = '<div class="no-data">No recent transactions found</div>';
    } else {
      txEl.innerHTML = visibleTxs.map(tx => {
        const date = tx.timeStamp ? new Date(tx.timeStamp * 1000).toLocaleDateString() : 'N/A';
        return `
          <div class="tx-row">
            <div class="tx-type ${tx.type === 'in' ? 'tx-in' : 'tx-out'}">${tx.type === 'in' ? '↓ IN' : '↑ OUT'}</div>
            <div class="tx-chain">${CHAINS[tx.chain]?.name || tx.chain}</div>
            <a class="tx-hash" href="${tx.explorerUrl}" target="_blank" rel="noopener">${tx.hash?.slice(0, 10)}...${tx.hash?.slice(-6)}</a>
            <div class="tx-amount">${formatNum(tx.value, 6)} ETH</div>
            <div class="tx-time">${date}</div>
          </div>`;
      }).join('');
    }
  }
}

fetchAllData();
setInterval(fetchAllData, 60000);
