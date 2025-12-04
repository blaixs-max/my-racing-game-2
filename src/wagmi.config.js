import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  trustWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';

// WalletConnect Project ID - Critical for mobile connection
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'a01e43bf25a11bf3e32d058780b62fe8';

// Dynamic Metadata Generation
const getAppMetadata = () => {
  const isClient = typeof window !== 'undefined';
  const origin = isClient ? window.location.origin : 'https://newracing.netlify.app';

  // Ensure trailing slash for deep linking compatibility
  const url = origin.endsWith('/') ? origin : `${origin}/`;

  return {
    name: 'LUMEXIA Racing',
    description: 'Endless Web3 Racing Game',
    url: url, // Must match the domain exactly
    icons: [`${url}icon.png`],
  };
};

const appMetadata = getAppMetadata();

// Wallet Configuration
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        metaMaskWallet, // RainbowKit handles WalletConnect internally for MetaMask
        trustWallet,
        walletConnectWallet,
        rainbowWallet,
      ],
    },
  ],
  {
    appName: appMetadata.name,
    projectId: projectId,
    appDescription: appMetadata.description,
    appUrl: appMetadata.url,
    appIcon: appMetadata.icons[0],
  }
);

export const config = createConfig({
  connectors,
  chains: [bscTestnet],
  // Increase polling interval to reduce RPC load, rely on explicit updates
  pollingInterval: 5_000,
  transports: {
    [bscTestnet.id]: http(),
  },
});

// BSC Testnet Configuration
export const BSC_TESTNET = {
  id: 97,
  name: 'BSC Testnet',
  network: 'bsc-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'tBNB',
  },
  rpcUrls: {
    default: {
      http: ['https://data-seed-prebsc-1-s1.bnbchain.org:8545'],
    },
    public: {
      http: ['https://data-seed-prebsc-1-s1.bnbchain.org:8545'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BscScan',
      url: 'https://testnet.bscscan.com'
    },
  },
  testnet: true,
};

// Payment Receiver Address
export const PAYMENT_RECEIVER_ADDRESS = '0x093fc78470f68abd7b058d781f4aba90cb634697';

// Pricing Configuration
export const PRICING = {
  1: '0.001',
  5: '0.005',
  10: '0.01',
};

// Convert BNB to Wei
export function bnbToWei(bnbAmount) {
  return BigInt(Math.floor(parseFloat(bnbAmount) * 1e18));
}
