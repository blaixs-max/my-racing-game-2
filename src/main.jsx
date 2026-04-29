import './polyfills.js' // MUST be first — provides globalThis.Buffer for @solana/*
import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
  TrustWalletAdapter
} from '@solana/wallet-adapter-wallets'
import './index.css'
import '@solana/wallet-adapter-react-ui/styles.css'
import App from './App.jsx'
import { DEFAULT_RPC_ENDPOINT, WALLET_CONFIG } from './solana.config.js'

// Solana Wallet Provider Component
function SolanaWalletProvider({ children }) {
  // Configure wallets
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new CoinbaseWalletAdapter(),
    new TrustWalletAdapter()
  ], []);

  return (
    <ConnectionProvider
      endpoint={DEFAULT_RPC_ENDPOINT}
      config={{
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000
      }}
    >
      <WalletProvider
        wallets={wallets}
        autoConnect={WALLET_CONFIG.autoConnect}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SolanaWalletProvider>
      <App />
    </SolanaWalletProvider>
  </StrictMode>,
)
