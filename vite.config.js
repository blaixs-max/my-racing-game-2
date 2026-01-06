import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true
  },
  optimizeDeps: {
    include: ['three', '@react-three/fiber', '@react-three/drei'],
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate Three.js and 3D libraries for better caching
          'three-vendor': [
            'three',
            '@react-three/fiber',
            '@react-three/drei',
            '@react-three/postprocessing'
          ],
          // Solana wallet libraries in separate chunk
          'solana-vendor': [
            '@solana/web3.js',
            '@solana/wallet-adapter-react',
            '@solana/wallet-adapter-react-ui',
            '@solana/wallet-adapter-wallets',
            '@solana/spl-token'
          ],
          // Supabase in separate chunk
          'supabase-vendor': [
            '@supabase/supabase-js'
          ],
          // React and core libraries
          'react-vendor': [
            'react',
            'react-dom',
            'zustand'
          ]
        }
      }
    },
    chunkSizeWarningLimit: 500, // Warn if chunk exceeds 500KB
    minify: 'terser', // Better minification
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true
      }
    }
  }
})
