// Supabase Edge Function: Verify BNB Payment
// This function verifies native BNB transfer transactions and adds credits to users

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

// BSC Mainnet RPC endpoints (with fallbacks)
const BSC_MAINNET_RPCS = [
  'https://bsc-dataseed1.bnbchain.org',
  'https://bsc-dataseed2.bnbchain.org',
  'https://bsc-dataseed3.bnbchain.org',
  'https://bsc.publicnode.com',
];

// BNB Payment Receiver Address
const PAYMENT_RECEIVER = '0xd9f15618745ce7a46da6fb321b6c2f0320b63e91'.toLowerCase();

// BNB Pricing Configuration (must match frontend)
const PRICING_BNB: { [key: number]: string } = {
  1: '0.0015',   // 1 credit = 0.0015 BNB
  5: '0.0075',   // 5 credits = 0.0075 BNB
  10: '0.015',   // 10 credits = 0.015 BNB
};

// Allow 5% tolerance for price fluctuation
const PRICE_TOLERANCE = 0.05;

interface TransactionData {
  transactionHash: string;
  userAddress: string;
  packageAmount: number;
}

// Validation helpers
const isValidEthAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

const isValidTxHash = (hash: string): boolean => {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
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

    const { transactionHash, userAddress, packageAmount }: TransactionData = await req.json();

    // INPUT VALIDATION
    if (!transactionHash || !isValidTxHash(transactionHash)) {
      return new Response(
        JSON.stringify({ error: 'Invalid transaction hash format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userAddress || !isValidEthAddress(userAddress)) {
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

    console.log('🔍 Verifying BNB payment:', { transactionHash, userAddress, packageAmount });

    // 1. CHECK IF TRANSACTION ALREADY PROCESSED
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('transaction_hash', transactionHash)
      .single();

    if (existingTx) {
      return new Response(
        JSON.stringify({ error: 'Transaction already processed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. VERIFY BNB TRANSFER ON BLOCKCHAIN
    const txData = await verifyBNBTransferOnChain(transactionHash, userAddress);

    if (!txData.valid) {
      return new Response(
        JSON.stringify({ error: 'Invalid transaction', details: txData.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. VALIDATE BNB TRANSFER DETAILS
    // Check receiver address
    if (txData.to?.toLowerCase() !== PAYMENT_RECEIVER) {
      return new Response(
        JSON.stringify({ error: 'Invalid payment receiver' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check sender address
    if (txData.from?.toLowerCase() !== userAddress.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'Sender address mismatch' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate BNB amount with tolerance
    const expectedBnb = parseFloat(PRICING_BNB[packageAmount]);
    const receivedBnb = txData.bnbAmount || 0;
    const minExpected = expectedBnb * (1 - PRICE_TOLERANCE);

    if (receivedBnb < minExpected) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient BNB amount',
          expected: expectedBnb,
          received: receivedBnb,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ BNB transfer verified:', {
      from: txData.from,
      to: txData.to,
      bnbAmount: receivedBnb,
      expectedBnb: expectedBnb,
    });

    // 4. GET OR CREATE USER
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

    // 5. ADD CREDITS AND LOG TRANSACTION
    const newCredits = (user.credits || 0) + packageAmount;
    const newTotalSpent = (user.total_spent || 0) + packageAmount;

    // Insert transaction FIRST to prevent duplicate credit addition
    const { data: txRecord, error: txInsertError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: packageAmount,
        credits_added: packageAmount,
        transaction_hash: transactionHash,
        status: 'pending',
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
      bnbPaid: receivedBnb,
    });

    return new Response(
      JSON.stringify({
        success: true,
        credits: newCredits,
        transactionHash,
        bnbAmount: receivedBnb,
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

// RPC call with fallback
async function rpcCall(method: string, params: unknown[], maxRetries = 3): Promise<unknown> {
  let lastError: Error | null = null;

  for (const rpcUrl of BSC_MAINNET_RPCS) {
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

// Verify native BNB transfer on BSC blockchain
async function verifyBNBTransferOnChain(txHash: string, expectedSender: string, maxRetries = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Verification attempt ${attempt}/${maxRetries} for tx: ${txHash}`);

      // Get transaction details
      const tx = await rpcCall('eth_getTransactionByHash', [txHash]) as {
        from: string;
        to: string;
        value: string;
        blockNumber: string | null;
      } | null;

      if (!tx) {
        console.log(`⏳ Attempt ${attempt}: Transaction not found yet`);
        if (attempt < maxRetries) {
          await sleep(delayMs);
          continue;
        }
        return { valid: false, error: 'Transaction not found after retries' };
      }

      // Check if transaction is mined
      if (!tx.blockNumber) {
        console.log(`⏳ Attempt ${attempt}: Transaction pending (not mined)`);
        if (attempt < maxRetries) {
          await sleep(delayMs);
          continue;
        }
        return { valid: false, error: 'Transaction still pending' };
      }

      // Get transaction receipt to check status
      const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]) as {
        status: string;
        blockNumber: string;
      } | null;

      if (!receipt) {
        console.log(`⏳ Attempt ${attempt}: Receipt not found yet`);
        if (attempt < maxRetries) {
          await sleep(delayMs);
          continue;
        }
        return { valid: false, error: 'Transaction receipt not found' };
      }

      // Check if transaction succeeded
      if (receipt.status !== '0x1') {
        return { valid: false, error: 'Transaction failed/reverted' };
      }

      // Parse BNB amount (value is in wei, hex format)
      const valueWei = BigInt(tx.value);
      const bnbAmount = Number(valueWei) / 1e18;

      console.log(`✅ BNB transfer found:`, {
        from: tx.from,
        to: tx.to,
        amount: bnbAmount,
        attempt,
      });

      return {
        valid: true,
        from: tx.from,
        to: tx.to,
        bnbAmount: bnbAmount,
        blockNumber: parseInt(receipt.blockNumber, 16),
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
