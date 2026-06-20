const WALLET = '0x26B7805Dd8aEc26DA55fc8e0c659cf6822b740Be';
const WALLET_LOW = WALLET.toLowerCase();

// Build-time data injected by Vite (only available in production build)
const BUILD_DATA = typeof __BUILD_DATA__ !== 'undefined' ? JSON.parse(__BUILD_DATA__) : null;

const CHAINS = {
  base: {
    name: 'Base',
    rpc: '/rpc/base',
    icon: '🔵',
    cssClass: 'chain-base',
    badgeClass: 'badge-base',
    explorer: 'https://basescan.org',
    explorerApi: '/api/blockscout/api/v2',
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
    rpc: '/rpc/ethereum',
    icon: '💜',
    cssClass: 'chain-ethereum',
    badgeClass: 'badge-ethereum',
    explorer: 'https://etherscan.io',
    explorerApi: '/api/etherscan',
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
    rpc: '/rpc/optimism',
    icon: '🔴',
    cssClass: 'chain-optimism',
    badgeClass: 'badge-optimism',
    explorer: 'https://optimistic.etherscan.io',
    explorerApi: '/api/opscout',
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
    rpc: '/rpc/arbitrum',
    icon: '🔷',
    cssClass: 'chain-arbitrum',
    badgeClass: 'badge-arbitrum',
    explorer: 'https://arbiscan.io',
    explorerApi: '/api/arbiscan',
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
let rpcBlocked = false;

function hexToBigInt(hex) {
  if (!hex || hex === '0x' || hex === '0x0') return 0n;
  return BigInt(hex);
}

async function rpcCall(chainKey, method, params) {
  const chain = CHAINS[chainKey];
  try {
    const res = await fetch(chain.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.result;
  } catch (e) {
    console.warn(`RPC ${chainKey} ${method} failed:`, e.message);
    rpcBlocked = true;
    return null;
  }
}

async function getNativeBalance(chainKey) {
  const result = await rpcCall(chainKey, 'eth_getBalance', [WALLET, 'latest']);
  return result ? Number(hexToBigInt(result)) / 1e18 : 0;
}

async function getTokenBalance(chainKey, token) {
  const data = '0x70a08231' + WALLET_LOW.slice(2).padStart(64, '0');
  const result = await rpcCall(chainKey, 'eth_call', [{ to: token.address, data }, 'latest']);
  if (!result || result === '0x' || result === '0x0') return 0;
  const raw = hexToBigInt(result);
  return Number(raw) / (10 ** token.decimals);
}

async function getPrices() {
  let ethPrice = 0;
  let owockiPrice = 0;
  try {
    const [wethRes, owockiRes] = await Promise.all([
      fetch('/api/dexscreener/latest/dex/tokens/0x4200000000000000000000000000000000000006'),
      fetch('/api/dexscreener/latest/dex/tokens/0xfdc933ff4e2980d18becf48e4e030d8463a2bb07')
    ]);
    if (wethRes.ok) {
      const wethJson = await wethRes.json();
      const pair = wethJson?.pairs?.find(p => p.chainId === 'base') || wethJson?.pairs?.[0];
      if (pair) ethPrice = parseFloat(pair.priceUsd) || 0;
    }
    if (owockiRes.ok) {
      const owockiJson = await owockiRes.json();
      const pair = owockiJson?.pairs?.find(p => p.chainId === 'base') || owockiJson?.pairs?.[0];
      if (pair) owockiPrice = parseFloat(pair.priceUsd) || 0;
    }
  } catch (e) {
    console.warn('Price fetch failed:', e.message);
    rpcBlocked = true;
  }
  return { ethPrice, owockiPrice };
}

async function getTransactions(chainKey) {
  const chain = CHAINS[chainKey];
  try {
    // Use Blockscout API for Base, Etherscan-like for others
    let url;
    if (chainKey === 'base') {
      url = `/api/blockscout/api/v2/addresses/${WALLET}/transactions?filter=to%7Cfrom&page=1&page_size=5`;
    } else {
      url = `${chain.explorerApi}/api?module=account&action=txlist&address=${WALLET}&sort=desc&page=1&offset=5`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('explorer failed');
    const json = await res.json();
    
    if (chainKey === 'base' && json.items) {
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
    return [];
  } catch {
    rpcBlocked = true;
    return [];
  }
}

function loadBuildData() {
  if (!BUILD_DATA) return false;
  console.log('Loading build-time snapshot data');
  const bd = BUILD_DATA;
  state.ethPrice = bd.ethPrice || 0;
  state.owockiPrice = bd.owockiPrice || 0;
  state.isLive = false;
  
  // Build chain data
  for (const [key, bal] of Object.entries(bd.nativeBalances || {})) {
    state.chains[key] = {
      nativeBal: bal,
      nativeUsd: bal * state.ethPrice,
      tokenCount: 0
    };
  }
  
  // Build token data
  state.tokens = [];
  for (const [chainKey, chainTokens] of Object.entries(bd.tokenBalances || {})) {
    for (const t of chainTokens) {
      let price = 0;
      if (t.symbol === 'USDC' || t.symbol === 'USDT') price = 1;
      else if (t.symbol === 'WETH' || t.symbol === 'ETH') price = state.ethPrice;
      else if (t.symbol === 'OWOCKIBOT') price = state.owockiPrice;
      
      if (t.balance > 0) {
        state.tokens.push({ ...t, chain: chainKey, usdValue: t.balance * price, price });
        if (state.chains[chainKey]) state.chains[chainKey].tokenCount++;
      }
    }
  }
  state.tokens.sort((a, b) => b.usdValue - a.usdValue);
  
  // Build transaction data
  state.txs = (bd.transactions || []).sort((a, b) => b.timeStamp - a.timeStamp).slice(0, 20);
  
  return true;
}

async function fetchAllData() {
  isLoading = true;
  rpcBlocked = false;
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.disabled = true;
  
  try {
    const { ethPrice, owockiPrice } = await getPrices();
    
    // If all price APIs were blocked, fall back to build data
    if (rpcBlocked && ethPrice === 0 && BUILD_DATA) {
      loadBuildData();
      isLoading = false;
      if (btn) btn.disabled = false;
      render();
      document.getElementById('lastUpdated').textContent = 
        `Snapshot: ${BUILD_DATA.timestamp ? new Date(BUILD_DATA.timestamp).toLocaleString() : 'build time'}`;
      return;
    }
    
    state.ethPrice = ethPrice;
    state.owockiPrice = owockiPrice;
    state.isLive = true;
    
    const chainKeys = Object.keys(CHAINS);
    const chainResults = await Promise.all(chainKeys.map(async (key) => {
      const [nativeBal, ...tokenResults] = await Promise.all([
        getNativeBalance(key),
        ...CHAINS[key].tokens.map(t => getTokenBalance(key, t).then(bal => ({ ...t, balance: bal, chain: key })))
      ]);
      const txs = await getTransactions(key);
      return { key, nativeBal, tokens: tokenResults, txs };
    }));
    
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
    if (BUILD_DATA && Object.keys(state.chains).length === 0) {
      loadBuildData();
    }
  }
  
  isLoading = false;
  if (btn) btn.disabled = false;
  render();
  document.getElementById('lastUpdated').textContent = 
    state.isLive ? `Live: ${new Date().toLocaleTimeString()}` : `Snapshot: ${BUILD_DATA?.timestamp ? new Date(BUILD_DATA.timestamp).toLocaleString() : 'unknown'}`;
}

window.toggleChain = function(chain) {
  activeChain = chain;
  document.querySelectorAll('.chain-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.chain === chain);
  });
  render();
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
  document.getElementById('totalValue').textContent = formatUsd(total);
  
  // Show live/snapshot badge
  const liveBadge = document.getElementById('liveBadge');
  if (liveBadge) {
    liveBadge.textContent = state.isLive ? '🟢 LIVE' : '📷 SNAPSHOT';
    liveBadge.style.color = state.isLive ? '#008456' : '#72767d';
  }
  
  const cardsEl = document.getElementById('chainCards');
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
  
  const tokenEl = document.getElementById('tokenTable');
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
  
  const txEl = document.getElementById('txTable');
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

window.refresh = function() {
  fetchAllData();
};

fetchAllData();
setInterval(fetchAllData, 60000);
