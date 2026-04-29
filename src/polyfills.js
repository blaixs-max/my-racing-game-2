// Browser polyfills required by @solana/* libraries.
//
// Vite does not polyfill Node globals by default. @solana/spl-token's
// account deserializer (getAccount, unpackAccount) calls Buffer.from /
// Buffer.alloc, and @solana/web3.js uses Buffer in several decoders.
// Without a global Buffer, those calls throw "Buffer is not defined" at
// runtime, which is silently swallowed wherever the calling code has a
// catch-all — exactly how TOKABU balance was reading as 0 even though
// the wallet held the tokens on-chain.
//
// This file MUST be the first import in main.jsx so the assignment runs
// before any other module's body code (and crucially, before React
// renders any component that may trigger a balance fetch).

import { Buffer as NodeBuffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = NodeBuffer;
}
