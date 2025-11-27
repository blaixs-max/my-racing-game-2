import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { bscTestnet } from 'wagmi/chains';

// Wallet Configuration
export const config = getDefaultConfig({
  appName: 'LUMEXIA Racing',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // WalletConnect Cloud'dan alınacak
  chains: [bscTestnet],
  ssr: false, // Vite kullanıyoruz, SSR yok
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
