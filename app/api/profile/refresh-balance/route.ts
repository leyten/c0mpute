import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privyId } = body;

    if (!privyId) {
      return NextResponse.json(
        { error: 'Missing privyId' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get current profile
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('privy_id', privyId)
      .single();

    if (fetchError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Check if we need to refresh (cache expired or never fetched)
    const lastUpdated = profile.balance_updated_at 
      ? new Date(profile.balance_updated_at).getTime() 
      : 0;
    const now = Date.now();
    
    if (now - lastUpdated < CACHE_DURATION_MS) {
      // Return cached balance
      return NextResponse.json({ 
        balance: profile.zero_balance,
        cached: true,
        updated_at: profile.balance_updated_at
      });
    }

    // Need to fetch fresh balance
    if (!profile.wallet_address) {
      return NextResponse.json({ 
        balance: 0,
        cached: false,
        error: 'No wallet address linked'
      });
    }

    // Fetch balance from Solana Tracker API
    const tokenAddress = process.env.NEXT_PUBLIC_ZERO_TOKEN_ADDRESS;
    
    if (!tokenAddress) {
      return NextResponse.json(
        { error: 'Token address not configured' },
        { status: 500 }
      );
    }

    let newBalance = 0;

    try {
      // Solana Tracker API to get all token balances in wallet
      // API docs: https://docs.solanatracker.io/
      const apiKey = process.env.SOLANA_TRACKER_API_KEY;
      
      const response = await fetch(
        `https://data.solanatracker.io/wallet/${profile.wallet_address}`,
        {
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Find the $ZERO token in the tokens array by matching mint address
        const zeroToken = data.tokens?.find(
          (t: { token: { mint: string }; balance: number }) => 
            t.token.mint === tokenAddress
        );
        
        if (zeroToken) {
          newBalance = zeroToken.balance || 0;
        }
      } else {
        // If API fails, try alternative method or return 0
        console.warn('Solana Tracker API failed:', response.status);
      }
    } catch (apiError) {
      console.error('Error fetching balance from Solana Tracker:', apiError);
      // Continue with 0 balance if API fails
    }

    // Update balance in database
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        zero_balance: newBalance,
        balance_updated_at: new Date().toISOString(),
      })
      .eq('privy_id', privyId);

    if (updateError) {
      console.error('Failed to update balance:', updateError);
    }

    return NextResponse.json({ 
      balance: newBalance,
      cached: false,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Balance refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
