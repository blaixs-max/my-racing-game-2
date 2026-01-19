// Supabase Edge Function: Verify COAL Token Payment on Solana
// This function verifies SPL token transfer transactions and adds credits to users

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Allowed origins for CORS
const allowedOrigins = [
  'https://lumexia.net',
  'https://game.lumexia.net',
  'http://localhost:5173', // Development
];

// Dynamic CORS headers based on request origin
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Solana Mainnet RPC endpoints (with fallbacks)
const SOLANA_MAINNET_RPCS = [
  'https://mainnet.helius-rpc.com/?api-key=5853e3ab-7918-4a18-8f02-923f2da827b0',
  'https://api.mainnet-beta.solana.com',
];

// OILTOWN Token Configuration
const COAL_TOKEN_MINT = 'AakmsJ4vebK1Uk3eWPRPx89WzEDq2knvN2sgGcXEpump';
const TOKEN_DECIMALS = 6;

// Payment Receiver Wallet Address (Solana)
const PAYMENT_RECEIVER = 'T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg';

// Jupiter Price API for dynamic pricing
const JUPITER_PRICE_API = 'https://price.jup.ag/v6/price';

// Allow 10% tolerance for price fluctuation (crypto is volatile)
const PRICE_TOLERANCE = 0.10;

interface TransactionData {
  transactionSignature: string;
  userAddress: string;
  packageAmount: number;
  blockchain?: string;
}

// Validation helpers
const isValidSolanaAddress = (address: string): boolean => {
  // Solana addresses are base58 encoded, 32-44 characters
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

const isValidSolanaSignature = (signature: string): boolean => {
  // Solana signatures are base58 encoded, typically 87-88 characters
  return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature);
};

const isValidPackageAmount = (amount: number): boolean => {
  return [1, 5, 10].includes(amount);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { transactionSignature, userAddress, packageAmount, blockchain }: TransactionData = await req.json();

    // INPUT VALIDATION
    if (!transactionSignature || !isValidSolanaSignature(transactionSignature)) {
      return new Response(
        JSON.stringify({ error: 'Invalid transaction signature format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userAddress || !isValidSolanaAddress(userAddress)) {
      return new Response(
        JSON.stringify({ error: 'Invalid wallet address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!packageAmount || !isValidPackageAmount(packageAmount)) {
      return new Response(
        JSON.stringify({ error: 'Invalid package amount. Must be 1, 5, or 10' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔍 Verifying COAL payment on Solana:', { transactionSignature, userAddress, packageAmount });

    // 1. CHECK IF TRANSACTION ALREADY PROCESSED
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('transaction_hash', transactionSignature)
      .single();

    if (existingTx) {
      return new Response(
        JSON.stringify({ error: 'Transaction already processed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. GET CURRENT COAL PRICE FROM JUPITER
    const coalPrice = await getCoalPrice();
    if (!coalPrice) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch COAL token price' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate expected COAL amount for the package (USD value)
    const expectedCoalAmount = packageAmount / coalPrice;
    const minExpectedCoal = expectedCoalAmount * (1 - PRICE_TOLERANCE);

    console.log('💰 Price calculation:', {
      packageUsd: packageAmount,
      coalPrice: coalPrice,
      expectedCoal: expectedCoalAmount,
      minExpectedCoal: minExpectedCoal,
    });

    // 3. VERIFY SOLANA TRANSACTION ON BLOCKCHAIN
    const txData = await verifySolanaTransaction(transactionSignature, userAddress);

    if (!txData.valid) {
      return new Response(
        JSON.stringify({ error: 'Invalid transaction', details: txData.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. VALIDATE TOKEN TRANSFER DETAILS
    // Check if it's a COAL token transfer
    if (!txData.isCoalTransfer) {
      return new Response(
        JSON.stringify({ error: 'Transaction is not a COAL token transfer' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check receiver address
    if (txData.receiver !== PAYMENT_RECEIVER) {
      return new Response(
        JSON.stringify({ error: 'Invalid payment receiver' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check sender address
    if (txData.sender !== userAddress) {
      return new Response(
        JSON.stringify({ error: 'Sender address mismatch' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate COAL amount with tolerance
    const receivedCoal = txData.tokenAmount || 0;

    if (receivedCoal < minExpectedCoal) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient COAL amount',
          expected: expectedCoalAmount,
          minimum: minExpectedCoal,
          received: receivedCoal,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ COAL transfer verified:', {
      sender: txData.sender,
      receiver: txData.receiver,
      coalAmount: receivedCoal,
      expectedCoal: expectedCoalAmount,
      coalPrice: coalPrice,
    });

    // 5. GET OR CREATE USER
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', userAddress)
      .single();

    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          wallet_address: userAddress,
          credits: 0,
          total_games_played: 0,
          total_spent: 0,
        })
        .select()
        .single();

      if (createError) throw createError;
      user = newUser;
    }

    // 6. ADD CREDITS AND LOG TRANSACTION
    const newCredits = (user.credits || 0) + packageAmount;
    const newTotalSpent = (user.total_spent || 0) + packageAmount;

    // Insert transaction FIRST to prevent duplicate credit addition
    const { data: txRecord, error: txInsertError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: packageAmount,
        credits_added: packageAmount,
        transaction_hash: transactionSignature,
        status: 'pending',
        token_amount: receivedCoal,
        token_symbol: 'COAL',
      })
      .select()
      .single();

    if (txInsertError) {
      if (txInsertError.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Transaction already processed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw txInsertError;
    }

    // Update user credits
    const { error: updateError } = await supabase
      .from('users')
      .update({
        credits: newCredits,
        total_spent: newTotalSpent,
      })
      .eq('wallet_address', userAddress);

    if (updateError) {
      // ROLLBACK: Delete the transaction record if credit update fails
      await supabase.from('transactions').delete().eq('id', txRecord.id);
      throw updateError;
    }

    // Mark transaction as successful
    await supabase
      .from('transactions')
      .update({ status: 'success' })
      .eq('id', txRecord.id);

    console.log('✅ Payment verified and credits added:', {
      user: userAddress,
      credits: packageAmount,
      newBalance: newCredits,
      coalPaid: receivedCoal,
      coalPrice: coalPrice,
    });

    return new Response(
      JSON.stringify({
        success: true,
        credits: newCredits,
        transactionSignature,
        coalAmount: receivedCoal,
        coalPrice: coalPrice,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to wait
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get COAL token price from Jupiter API
async function getCoalPrice(): Promise<number | null> {
  try {
    const response = await fetch(`${JUPITER_PRICE_API}?ids=${COAL_TOKEN_MINT}`);
    const data = await response.json();

    if (data.data && data.data[COAL_TOKEN_MINT]) {
      return data.data[COAL_TOKEN_MINT].price;
    }

    // Fallback to DexScreener if Jupiter doesn't have data
    return await getCoalPriceFromDexScreener();
  } catch (error) {
    console.error('Failed to fetch COAL price from Jupiter:', error);
    return await getCoalPriceFromDexScreener();
  }
}

// Fallback price source: DexScreener
async function getCoalPriceFromDexScreener(): Promise<number | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${COAL_TOKEN_MINT}`);
    const data = await response.json();

    if (data.pairs && data.pairs.length > 0) {
      // Get the pair with highest liquidity
      const bestPair = data.pairs.reduce((best: any, pair: any) =>
        (pair.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? pair : best
      );
      return parseFloat(bestPair.priceUsd);
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch COAL price from DexScreener:', error);
    return null;
  }
}

// Solana RPC call with fallback
async function solanaRpcCall(method: string, params: unknown[], maxRetries = 3): Promise<unknown> {
  let lastError: Error | null = null;

  for (const rpcUrl of SOLANA_MAINNET_RPCS) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method,
            params,
          }),
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message || 'RPC error');
        }

        return data.result;
      } catch (error) {
        lastError = error as Error;
        console.log(`RPC ${rpcUrl} attempt ${attempt} failed:`, error.message);
        if (attempt < maxRetries) {
          await sleep(1000 * attempt);
        }
      }
    }
  }

  throw lastError || new Error('All RPC endpoints failed');
}

// Verify Solana transaction
async function verifySolanaTransaction(signature: string, expectedSender: string, maxRetries = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Verification attempt ${attempt}/${maxRetries} for signature: ${signature}`);

      // Get transaction details with parsed instructions
      const tx = await solanaRpcCall('getTransaction', [
        signature,
        {
          encoding: 'jsonParsed',
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        }
      ]) as {
        slot: number;
        meta: {
          err: unknown | null;
          preTokenBalances: Array<{
            accountIndex: number;
            mint: string;
            owner: string;
            uiTokenAmount: { uiAmount: number };
          }>;
          postTokenBalances: Array<{
            accountIndex: number;
            mint: string;
            owner: string;
            uiTokenAmount: { uiAmount: number };
          }>;
        };
        transaction: {
          message: {
            accountKeys: Array<{ pubkey: string; signer: boolean }>;
            instructions: Array<{
              programId: string;
              parsed?: {
                type: string;
                info: {
                  source?: string;
                  destination?: string;
                  authority?: string;
                  amount?: string;
                  tokenAmount?: { uiAmount: number };
                };
              };
            }>;
          };
        };
      } | null;

      if (!tx) {
        console.log(`⏳ Attempt ${attempt}: Transaction not found yet`);
        if (attempt < maxRetries) {
          await sleep(delayMs);
          continue;
        }
        return { valid: false, error: 'Transaction not found after retries' };
      }

      // Check if transaction succeeded
      if (tx.meta.err) {
        return { valid: false, error: 'Transaction failed/reverted' };
      }

      // Find COAL token transfer in the transaction
      let isCoalTransfer = false;
      let sender = '';
      let receiver = '';
      let tokenAmount = 0;

      // Method 1: Check parsed instructions for SPL Token transfer
      for (const instruction of tx.transaction.message.instructions) {
        if (instruction.parsed?.type === 'transfer' || instruction.parsed?.type === 'transferChecked') {
          const info = instruction.parsed.info;

          // Get authority (sender wallet)
          sender = info.authority || '';

          // We need to find the receiver from token balances
          // The destination is an ATA, not the wallet address
        }
      }

      // Method 2: Analyze token balance changes to find COAL transfer
      const preBalances = tx.meta.preTokenBalances || [];
      const postBalances = tx.meta.postTokenBalances || [];

      // Find COAL token balance changes
      for (const postBalance of postBalances) {
        if (postBalance.mint === COAL_TOKEN_MINT) {
          const preBalance = preBalances.find(
            pb => pb.owner === postBalance.owner && pb.mint === COAL_TOKEN_MINT
          );

          const preBal = preBalance?.uiTokenAmount.uiAmount || 0;
          const postBal = postBalance.uiTokenAmount.uiAmount || 0;
          const change = postBal - preBal;

          // Receiver (balance increased)
          if (change > 0 && postBalance.owner === PAYMENT_RECEIVER) {
            isCoalTransfer = true;
            receiver = postBalance.owner;
            tokenAmount = change;
          }
        }
      }

      // Find sender (balance decreased)
      for (const preBalance of preBalances) {
        if (preBalance.mint === COAL_TOKEN_MINT) {
          const postBalance = postBalances.find(
            pb => pb.owner === preBalance.owner && pb.mint === COAL_TOKEN_MINT
          );

          const preBal = preBalance.uiTokenAmount.uiAmount || 0;
          const postBal = postBalance?.uiTokenAmount.uiAmount || 0;
          const change = postBal - preBal;

          // Sender (balance decreased)
          if (change < 0) {
            sender = preBalance.owner;
          }
        }
      }

      if (!isCoalTransfer) {
        // Alternative: Check if any COAL was received by payment address
        for (const postBalance of postBalances) {
          if (postBalance.mint === COAL_TOKEN_MINT && postBalance.owner === PAYMENT_RECEIVER) {
            const preBalance = preBalances.find(
              pb => pb.owner === PAYMENT_RECEIVER && pb.mint === COAL_TOKEN_MINT
            );
            const preBal = preBalance?.uiTokenAmount.uiAmount || 0;
            const postBal = postBalance.uiTokenAmount.uiAmount || 0;

            if (postBal > preBal) {
              isCoalTransfer = true;
              receiver = PAYMENT_RECEIVER;
              tokenAmount = postBal - preBal;
            }
          }
        }
      }

      // If still no sender, use the first signer
      if (!sender) {
        const signers = tx.transaction.message.accountKeys.filter(ak => ak.signer);
        if (signers.length > 0) {
          sender = signers[0].pubkey;
        }
      }

      console.log(`✅ Solana transaction analysis:`, {
        isCoalTransfer,
        sender,
        receiver,
        tokenAmount,
        slot: tx.slot,
        attempt,
      });

      return {
        valid: true,
        isCoalTransfer,
        sender,
        receiver,
        tokenAmount,
        slot: tx.slot,
      };
    } catch (error) {
      console.log(`❌ Attempt ${attempt} error:`, error.message);
      if (attempt < maxRetries) {
        await sleep(delayMs);
        continue;
      }
      return { valid: false, error: error.message };
    }
  }

  return { valid: false, error: 'Max retries exceeded' };
}
