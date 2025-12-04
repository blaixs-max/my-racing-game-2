import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  trustWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http, createStorage } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';

// WalletConnect Project ID
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'a01e43bf25a11bf3e32d058780b62fe8';

// Dynamic Metadata Generation
const getAppMetadata = () => {
  const isClient = typeof window !== 'undefined';
  const origin = isClient ? window.location.origin : 'https://newracing.netlify.app';
  const url = origin.endsWith('/') ? origin : `${origin}/`;

  return {
    name: 'LUMEXIA Racing',
    description: 'Endless Web3 Racing Game',
    url: url,
    icons: [`${url}icon.png`],
  };
};

const appMetadata = getAppMetadata();

// Shared WalletConnect Parameters for all wallets
const sharedWalletConnectParams = {
  projectId: projectId,
  metadata: {
    name: appMetadata.name,
    description: appMetadata.description,
    url: appMetadata.url,
    icons: appMetadata.icons,
  },
};

// Wallet Configuration
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        // MetaMask: Explicitly pass walletConnectParameters to fix deep linking
        () => metaMaskWallet({
          projectId: projectId,
          walletConnectParameters: sharedWalletConnectParams,
        }),
        // Trust Wallet
        () => trustWallet({
          projectId: projectId,
          walletConnectParameters: sharedWalletConnectParams,
        }),
        // Generic WalletConnect
        () => walletConnectWallet({
          projectId: projectId,
          walletConnectParameters: sharedWalletConnectParams,
        }),
        // Rainbow
        () => rainbowWallet({
          projectId: projectId,
          walletConnectParameters: sharedWalletConnectParams,
        }),
      ],
    },
  ],
  {
    appName: appMetadata.name,
    projectId: projectId,
  }
);

export const config = createConfig({
  connectors,
  chains: [bscTestnet],
  // Persist connection state
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    key: 'lumexia-wagmi',
  }),
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
