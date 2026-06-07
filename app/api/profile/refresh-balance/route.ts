import { NextRequest, NextResponse } from 'next/server';
import { getProfileByPrivyId, updateBalance } from '@/lib/db';
import { getAuthUserId } from '@/lib/privy-server';

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    // Verify auth — only refresh own balance
    const authUserId = await getAuthUserId(request);
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const profile = getProfileByPrivyId(authUserId) as Record<string, unknown> | null;

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const lastUpdated = profile.balance_updated_at 
      ? new Date(profile.balance_updated_at as string).getTime() 
      : 0;
    const now = Date.now();
    
    if (now - lastUpdated < CACHE_DURATION_MS) {
      return NextResponse.json({ 
        balance: profile.zero_balance,
        cached: true,
        updated_at: profile.balance_updated_at
      });
    }

    if (!profile.wallet_address) {
      return NextResponse.json({ 
        balance: 0,
        cached: false,
        error: 'No wallet address linked'
      });
    }

    const tokenAddress = process.env.NEXT_PUBLIC_ZERO_TOKEN_ADDRESS;
    
    if (!tokenAddress) {
      return NextResponse.json(
        { error: 'Token address not configured' },
        { status: 500 }
      );
    }

    let newBalance = 0;

    try {
      const apiKey = process.env.SOLANA_TRACKER_API_KEY;
      
      const response = await fetch(
        `https://eu.data.solanatracker.io/wallet/${profile.wallet_address}`,
        {
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        const zeroToken = data.tokens?.find(
          (t: { token: { mint: string }; balance: number }) => 
            t.token.mint === tokenAddress
        );
        
        if (zeroToken) {
          newBalance = zeroToken.balance || 0;
        }
      } else {
        console.warn('Solana Tracker API failed:', response.status);
      }
    } catch (apiError) {
      console.error('Error fetching balance from Solana Tracker:', apiError);
    }

    updateBalance(authUserId, newBalance);

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
