// Supabase Edge Function: Verify Payment
// This function verifies blockchain transactions and adds credits to users

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

// BSC Testnet RPC endpoint
const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.bnbchain.org:8545';

// Payment receiver address - Must be set in Supabase Edge Function secrets
const PAYMENT_RECEIVER = Deno.env.get('PAYMENT_RECEIVER_ADDRESS') || '';

// Validate that payment receiver is configured
if (!PAYMENT_RECEIVER) {
  console.error('❌ PAYMENT_RECEIVER_ADDRESS environment variable is not set!');
}

// Pricing: amount in BNB -> credits
const PRICING: { [key: string]: number } = {
  '0.001': 1,
  '0.005': 5,
  '0.01': 10,
};

interface TransactionData {
  transactionHash: string;
  userAddress: string;
  packageAmount: number;
}

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

    // Validate payment receiver is configured
    if (!PAYMENT_RECEIVER) {
      console.error('❌ PAYMENT_RECEIVER_ADDRESS not configured');
      return new Response(
        JSON.stringify({ error: 'Payment system not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { transactionHash, userAddress, packageAmount }: TransactionData = await req.json();

    console.log('🔍 Verifying payment:', { transactionHash, userAddress, packageAmount });

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

    // 2. VERIFY TRANSACTION ON BLOCKCHAIN
    const txData = await verifyTransactionOnChain(transactionHash);

    if (!txData.valid) {
      return new Response(
        JSON.stringify({ error: 'Invalid transaction', details: txData.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. VALIDATE TRANSACTION DETAILS
    const expectedAmount = getExpectedAmount(packageAmount);
    if (txData.value !== expectedAmount) {
      return new Response(
        JSON.stringify({
          error: 'Invalid payment amount',
          expected: expectedAmount,
          received: txData.value
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (txData.to.toLowerCase() !== PAYMENT_RECEIVER.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'Invalid payment receiver' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (txData.from.toLowerCase() !== userAddress.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'Sender address mismatch' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // CRITICAL FIX: Insert transaction FIRST to prevent duplicate credit addition
    // If this fails, we haven't modified user credits yet
    const { data: txRecord, error: txInsertError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: packageAmount,
        credits_added: packageAmount,
        transaction_hash: transactionHash,
        status: 'pending', // Mark as pending until credits are added
      })
      .select()
      .single();

    if (txInsertError) {
      // If duplicate key error (transaction already exists), return error
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
    });

    return new Response(
      JSON.stringify({
        success: true,
        credits: newCredits,
        transactionHash,
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

// Verify transaction on BSC blockchain with retry mechanism
async function verifyTransactionOnChain(txHash: string, maxRetries = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Verification attempt ${attempt}/${maxRetries} for tx: ${txHash}`);

      const response = await fetch(BSC_TESTNET_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionByHash',
          params: [txHash],
        }),
      });

      const data = await response.json();
      const tx = data.result;

      if (!tx) {
        console.log(`⏳ Attempt ${attempt}: Transaction not found yet`);
        if (attempt < maxRetries) {
          await sleep(delayMs);
          continue;
        }
        return { valid: false, error: 'Transaction not found after retries' };
      }

      // Check if transaction is confirmed (has blockNumber)
      if (!tx.blockNumber) {
        console.log(`⏳ Attempt ${attempt}: Transaction not confirmed yet`);
        if (attempt < maxRetries) {
          await sleep(delayMs);
          continue;
        }
        return { valid: false, error: 'Transaction not confirmed after retries' };
      }

      // Transaction is confirmed!
      console.log(`✅ Transaction confirmed on attempt ${attempt}`);

      // Convert hex value to BNB (Wei to BNB: divide by 10^18)
      const valueInWei = BigInt(tx.value);
      const valueInBNB = Number(valueInWei) / 1e18;

      return {
        valid: true,
        from: tx.from,
        to: tx.to,
        value: valueInBNB.toFixed(3), // Format to 3 decimals
        blockNumber: parseInt(tx.blockNumber, 16),
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

// Get expected BNB amount for package
function getExpectedAmount(packageAmount: number): string {
  if (packageAmount === 1) return '0.001';
  if (packageAmount === 5) return '0.005';
  if (packageAmount === 10) return '0.010';
  throw new Error(`Invalid package amount: ${packageAmount}`);
}
