import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  trustWallet,
  rainbowWallet,
  walletConnectWallet,
  coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http, createStorage, fallback } from 'wagmi';
import { bsc } from 'wagmi/chains';

/**
 * WALLET CONFIGURATION - 2025 STABLE VERSION
 *
 * Key optimizations:
 * 1. WalletConnect v2 with proper chain pre-approval
 * 2. MetaMask SDK with universal links (not deep links)
 * 3. Multiple RPC fallbacks for reliability
 * 4. Proper mobile wallet handling
 */

// WalletConnect Project ID (Required for WalletConnect v2)
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'a01e43bf25a11bf3e32d058780b62fe8';

// Production App URL - Hardcoded for stable mobile redirects
const APP_URL = 'https://game.lumexia.net';

// App Metadata - Used by all wallet connectors
const appMetadata = {
  name: 'LUMEXIA Racing',
  description: 'Endless Web3 Racing Game on BSC',
  url: APP_URL,
  icons: [`${APP_URL}/icon.png`],
};

/**
 * WalletConnect v2 Shared Parameters
 *
 * Critical settings for stable connections:
 * - showQrModal: true - Always show QR for desktop fallback
 * - isNewChainsStale: false - Don't disconnect on new chains
 * - qrModalOptions - iOS Safari optimized settings
 */
const walletConnectParams = {
  projectId,
  metadata: appMetadata,
  showQrModal: true,
  qrModalOptions: {
    themeMode: 'dark',
    themeVariables: {
      '--wcm-z-index': '99999',
    },
    // Only show recommended wallets for cleaner UX
    explorerRecommendedWalletIds: [
      'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
      '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
      '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369', // Rainbow
    ],
  },
  // CRITICAL: Don't treat new chains as stale - prevents disconnection
  isNewChainsStale: false,
  // Mobile wallet deep link priorities
  mobileLinks: ['metamask', 'trust', 'rainbow'],
};

/**
 * MetaMask Wallet Configuration
 *
 * 2025 Best Practices:
 * - Use universal links instead of deep links on iOS
 * - Don't check installation immediately (causes issues on mobile browsers)
 * - Let SDK handle mobile detection
 */
const metaMaskConfig = {
  projectId,
  walletConnectParameters: walletConnectParams,
  // SDK Configuration
  dappMetadata: appMetadata,
  // IMPORTANT: Prefer desktop on non-mobile to avoid unnecessary redirects
  preferDesktop: false,
  // Don't check immediately - mobile browsers may not have window.ethereum
  checkInstallationImmediately: false,
  // Use universal links for iOS (more reliable than deep links)
  useDeeplink: false,
  // Infura fallback for mobile read-only requests (prevents disconnection)
  infuraAPIKey: import.meta.env.VITE_INFURA_API_KEY || undefined,
  // Extension-only mode disabled - allow mobile SDK
  extensionOnly: false,
};

/**
 * Wallet Connectors Configuration
 *
 * Order matters for UX - most popular wallets first
 */
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        // MetaMask - Most used wallet
        () => metaMaskWallet(metaMaskConfig),
        // Trust Wallet - Popular on mobile
        () => trustWallet({
          projectId,
          walletConnectParameters: walletConnectParams,
        }),
        // Coinbase Wallet - Growing user base
        () => coinbaseWallet({
          appName: appMetadata.name,
          appLogoUrl: appMetadata.icons[0],
        }),
      ],
    },
    {
      groupName: 'Other Wallets',
      wallets: [
        // Generic WalletConnect - Supports 300+ wallets
        () => walletConnectWallet({
          projectId,
          walletConnectParameters: walletConnectParams,
        }),
        // Rainbow Wallet
        () => rainbowWallet({
          projectId,
          walletConnectParameters: walletConnectParams,
        }),
      ],
    },
  ],
  {
    appName: appMetadata.name,
    projectId,
    appUrl: appMetadata.url,
    appIcon: appMetadata.icons[0],
  }
);

/**
 * BSC Mainnet RPC Endpoints (Multiple for fallback)
 *
 * Using fallback transport for reliability:
 * - Primary: Official BNB Chain RPC
 * - Secondary: Alternative endpoints
 */
const bscMainnetRpcUrls = [
  'https://bsc-dataseed1.bnbchain.org',
  'https://bsc-dataseed2.bnbchain.org',
  'https://bsc-dataseed3.bnbchain.org',
  'https://bsc-dataseed4.bnbchain.org',
  'https://bsc.publicnode.com',
];

/**
 * Main Wagmi Configuration
 */
export const config = createConfig({
  connectors,
  chains: [bsc],

  // Persist wallet connection across sessions
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    key: 'lumexia-wagmi-v3', // Updated for mainnet
  }),

  // Transport configuration with fallbacks
  transports: {
    [bsc.id]: fallback(
      bscMainnetRpcUrls.map(url => http(url, {
        // Retry failed requests
        retryCount: 3,
        retryDelay: 1000,
        // Timeout after 10 seconds
        timeout: 10_000,
      }))
    ),
  },

  // Polling interval for state updates (balance, etc.)
  // 3 seconds is good balance between responsiveness and RPC limits
  pollingInterval: 3_000,

  // Disable SSR for client-only app
  ssr: false,

  // Enable multicall for batched requests (reduces RPC calls)
  batch: {
    multicall: {
      wait: 50, // Wait 50ms to batch requests
    },
  },

  // Sync connected chain with wallet
  syncConnectedChain: true,
});

// ==================== EXPORTS ====================

// BSC Mainnet Chain Configuration
export const BSC_MAINNET = {
  id: 56,
  name: 'BNB Smart Chain',
  network: 'bsc',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: { http: bscMainnetRpcUrls },
    public: { http: bscMainnetRpcUrls },
  },
  blockExplorers: {
    default: {
      name: 'BscScan',
      url: 'https://bscscan.com',
    },
  },
  testnet: false,
};

// BNB Payment Receiver Address (BSC Mainnet)
export const PAYMENT_RECEIVER_ADDRESS = '0xd9f15618745ce7a46da6fb321b6c2f0320b63e91';

// BNB Pricing Configuration (Fixed prices)
// 1 Credit = 0.0015 BNB
export const PRICING_BNB = {
  1: '0.0015',   // 1 credit = 0.0015 BNB
  5: '0.0075',   // 5 credits = 0.0075 BNB
  10: '0.015',   // 10 credits = 0.015 BNB
};

// BSCScan link helpers
export function getBscScanTxLink(txHash) {
  return `https://bscscan.com/tx/${txHash}`;
}

export function getBscScanAddressLink(address) {
  return `https://bscscan.com/address/${address}`;
}
