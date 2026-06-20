import { defineConfig } from 'vite';
import { execSync } from 'child_process';

function fetchBuildData() {
  const WALLET = '0x26B7805Dd8aEc26DA55fc8e0c659cf6822b740Be';
  const WALLET_LOW = WALLET.toLowerCase();
  const BALANCEOF_DATA = '0x70a08231' + WALLET_LOW.slice(2).padStart(64, '0');
  
  function rpc(url, method, params) {
    try {
      const result = execSync(
        `curl -s -X POST '${url}' -H 'Content-Type: application/json' -d '${JSON.stringify({jsonrpc:'2.0',id:1,method,params})}'`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      return JSON.parse(result).result;
    } catch { return null; }
  }
  
  function get(url) {
    try {
      return execSync(`curl -s '${url}'`, { encoding: 'utf-8', timeout: 15000 });
    } catch { return null; }
  }
  
  const chainRpcs = {
    base: 'https://mainnet.base.org',
    ethereum: 'https://ethereum-rpc.publicnode.com',
    optimism: 'https://optimism-rpc.publicnode.com',
    arbitrum: 'https://arbitrum-one-rpc.publicnode.com',
  };
  
  // Native balances
  const nativeBalances = {};
  for (const [key, rpcUrl] of Object.entries(chainRpcs)) {
    const result = rpc(rpcUrl, 'eth_getBalance', [WALLET, 'latest']);
    nativeBalances[key] = result ? Number(BigInt(result)) / 1e18 : 0;
  }
  
  // Token balances per chain
  const allTokens = {
    base: [
      { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
      { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
      { symbol: 'OWOCKIBOT', address: '0xfdc933ff4e2980d18becf48e4e030d8463a2bb07', decimals: 18 },
    ],
    ethereum: [
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
      { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    ],
    optimism: [
      { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D0a0fA8d2f6e8c8e0fE3e', decimals: 6 },
      { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
      { symbol: 'USDT', address: '0x94b008aA00579c1307B0EF2c499AD98a8a4a6E0D', decimals: 6 },
    ],
    arbitrum: [
      { symbol: 'USDC', address: '0xaf88d06567e65abc3f1b2ad06c6b6b0fb9843c19', decimals: 6 },
      { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
      { symbol: 'USDT', address: '0xFd086b7Ae7ee1947a8EEf5E8e0E4E3a3F4e7c7f4', decimals: 6 },
    ]
  };
  
  const tokenBalances = {};
  for (const [chainKey, tokens] of Object.entries(allTokens)) {
    tokenBalances[chainKey] = tokens.map(t => {
      const result = rpc(chainRpcs[chainKey], 'eth_call', [{ to: t.address, data: BALANCEOF_DATA }, 'latest']);
      const bal = result && result !== '0x' && result !== '0x0' ? Number(BigInt(result)) / (10 ** t.decimals) : 0;
      return { symbol: t.symbol, address: t.address, decimals: t.decimals, balance: bal };
    });
  }
  
  // Prices
  let ethPrice = 0;
  let owockiPrice = 0;
  
  try {
    const cgData = get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    if (cgData) ethPrice = JSON.parse(cgData).ethereum.usd;
  } catch {}
  
  if (!ethPrice) {
    try {
      const dsData = get('https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006');
      if (dsData) {
        const pairs = JSON.parse(dsData).pairs;
        const basePair = pairs?.find(p => p.chainId === 'base');
        ethPrice = parseFloat(basePair?.priceUsd || 0);
      }
    } catch {}
  }
  
  try {
    const owockiData = get('https://api.dexscreener.com/latest/dex/tokens/0xfdc933ff4e2980d18becf48e4e030d8463a2bb07');
    if (owockiData) {
      const pairs = JSON.parse(owockiData).pairs;
      const basePair = pairs?.find(p => p.chainId === 'base');
      owockiPrice = parseFloat(basePair?.priceUsd || 0);
    }
  } catch {}
  
  // Transactions from Blockscout
  const transactions = [];
  try {
    const bsData = get(`https://base.blockscout.com/api/v2/addresses/${WALLET}/transactions`);
    if (bsData) {
      const items = JSON.parse(bsData).items || [];
      for (const tx of items) {
        const fromHash = tx.from?.hash?.toLowerCase() || '';
        const toHash = tx.to?.hash?.toLowerCase() || '';
        if (fromHash === WALLET_LOW || toHash === WALLET_LOW) {
          transactions.push({
            chain: 'base',
            hash: tx.hash,
            from: fromHash,
            to: toHash,
            value: Number(BigInt(tx.value || '0')) / 1e18,
            timeStamp: new Date(tx.timestamp).getTime() / 1000,
            type: fromHash === WALLET_LOW ? 'out' : 'in',
            explorerUrl: `https://basescan.org/tx/${tx.hash}`
          });
          if (transactions.length >= 10) break;
        }
      }
    }
  } catch (e) {
    console.warn('Blockscout fetch failed:', e.message);
  }
  
  const buildData = {
    timestamp: new Date().toISOString(),
    nativeBalances,
    tokenBalances,
    ethPrice,
    owockiPrice,
    transactions,
  };
  
  console.log('Build data fetched successfully');
  return buildData;
}

export default defineConfig(({ command }) => {
  const config = {
    server: {
      proxy: {
        '/rpc/base': {
          target: 'https://mainnet.base.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rpc\/base/, ''),
          headers: { 'Content-Type': 'application/json' }
        },
        '/rpc/ethereum': {
          target: 'https://ethereum-rpc.publicnode.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rpc\/ethereum/, ''),
          headers: { 'Content-Type': 'application/json' }
        },
        '/rpc/optimism': {
          target: 'https://optimism-rpc.publicnode.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rpc\/optimism/, ''),
          headers: { 'Content-Type': 'application/json' }
        },
        '/rpc/arbitrum': {
          target: 'https://arbitrum-one-rpc.publicnode.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rpc\/arbitrum/, ''),
          headers: { 'Content-Type': 'application/json' }
        },
        '/api/dexscreener': {
          target: 'https://api.dexscreener.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/dexscreener/, ''),
        },
        '/api/blockscout': {
          target: 'https://base.blockscout.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/blockscout/, ''),
        }
      }
    },
    define: {}
  };
  
  if (command === 'build') {
    const buildData = fetchBuildData();
    config.define.__BUILD_DATA__ = JSON.stringify(buildData);
  }
  
  return config;
});
