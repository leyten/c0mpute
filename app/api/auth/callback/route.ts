import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privyId, wallet, twitter } = body;

    if (!privyId) {
      return NextResponse.json(
        { error: 'Missing privyId' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Upsert the profile
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          privy_id: privyId,
          wallet_address: wallet || null,
          x_username: twitter?.username || null,
          x_id: twitter?.id || null,
        },
        {
          onConflict: 'privy_id',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to create/update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, profile: data });
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
