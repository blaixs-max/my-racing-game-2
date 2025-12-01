import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
  coinbaseWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'a01e43bf25a11bf3e32d058780b62fe8';

const appInfo = {
  appName: 'LUMEXIA Racing',
  projectId,
  appDescription: 'Endless Web3 Racing Game',
  // Use current window location if available (for deploy previews), otherwise fallback
  appUrl: typeof window !== 'undefined' ? window.location.origin + '/' : 'https://newracing.netlify.app/',
  appIcon: 'https://newracing.netlify.app/icon.png',
};

// Wallet Connectors
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        rainbowWallet,
        walletConnectWallet,
        coinbaseWallet,
        trustWallet,
      ],
    },
  ],
  {
    appName: appInfo.appName,
    projectId: appInfo.projectId,
    appDescription: appInfo.appDescription,
    appUrl: appInfo.appUrl,
    appIcon: appInfo.appIcon,
    walletConnectParameters: {
      metadata: {
        name: appInfo.appName,
        description: appInfo.appDescription,
        url: appInfo.appUrl,
        icons: [appInfo.appIcon],
      },
    },
  }
);

// Wallet Configuration
export const config = createConfig({
  connectors,
  chains: [bscTestnet],
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

// Payment Receiver Address (Sizin cüzdan adresiniz)
export const PAYMENT_RECEIVER_ADDRESS = '0x093fc78470f68abd7b058d781f4aba90cb634697';

// Pricing Configuration (1 credit = 0.001 BNB)
export const PRICING = {
  1: '0.001',  // $1 package = 1 credit = 0.001 BNB
  5: '0.005',  // $5 package = 5 credits = 0.005 BNB
  10: '0.01',  // $10 package = 10 credits = 0.01 BNB
};

// Convert BNB amount to Wei (1 BNB = 10^18 Wei)
export function bnbToWei(bnbAmount) {
  return BigInt(Math.floor(parseFloat(bnbAmount) * 1e18));
}
