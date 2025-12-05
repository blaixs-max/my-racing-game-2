import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { bscTestnet } from 'wagmi/chains'
import './index.css'
import App from './App.jsx'
import { config } from './wagmi.config'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagmiProvider config={config} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={bscTestnet}
          theme={darkTheme({
            accentColor: '#6366f1',
            accentColorForeground: 'white',
            borderRadius: 'medium',
          })}
          showRecentTransactions={true}
          modalSize="compact" // Better for mobile
          appInfo={{
            appName: 'LUMEXIA Racing',
            learnMoreUrl: 'https://newracing.netlify.app/',
            disclaimer: ({ Text, Link }) => (
              <Text>
                MetaMask açıldıktan sonra "Bağlan" butonuna basın, ardından bu uygulamaya geri dönün.
              </Text>
            ),
          }}
          // Mobile wallet connection configuration
          coolMode={false} // Disable confetti to reduce interference
          // iOS Safari: Keep modal open after connection initiated
          // to help users return to the app after confirming in wallet
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
