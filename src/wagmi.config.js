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

// FIXED METADATA - Critical for Mobile Deep Linking
// We hardcode the URL to ensure MetaMask always knows exactly where to return.
// Dynamic URLs (window.location) often confuse mobile wallets during redirects.
const APP_URL = 'https://newracing.netlify.app/';

const appMetadata = {
  name: 'LUMEXIA Racing',
  description: 'Endless Web3 Racing Game',
  url: APP_URL, // Hardcoded for stability
  icons: [`${APP_URL}icon.png`],
};

// Shared WalletConnect Parameters - Enhanced for Mobile
const sharedWalletConnectParams = {
  projectId: projectId,
  metadata: appMetadata,
  // Mobile-specific configurations
  showQrModal: true, // Always show QR modal as fallback
  qrModalOptions: {
    themeMode: 'dark',
    themeVariables: {
      '--wcm-z-index': '9999'
    }
  },
  // Disable email/SMS login to force wallet-only connection
  enableExplorer: true,
  // Mobile deep linking configuration
  mobileLinks: [
    'metamask',
    'trust',
    'rainbow',
  ],
};

// Wallet Configuration
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        // MetaMask
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
    appUrl: appMetadata.url, // Ensure top-level appUrl matches
    appIcon: appMetadata.icons[0],
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
  // Aggressive polling (1s) to catch mobile state changes immediately
  pollingInterval: 1_000,
  transports: {
    [bscTestnet.id]: http(),
  },
  // Enable automatic reconnection on page load and visibility change
  ssr: false,
  // Batch multiple requests together
  batch: {
    multicall: true,
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
