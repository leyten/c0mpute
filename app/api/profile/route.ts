import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const privyId = searchParams.get('privyId');

    if (!privyId) {
      return NextResponse.json(
        { error: 'Missing privyId parameter' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('privy_id', privyId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No profile found
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { privyId, ...updates } = body;

    if (!privyId) {
      return NextResponse.json(
        { error: 'Missing privyId' },
        { status: 400 }
      );
    }

    // Only allow updating certain fields
    const allowedFields = ['is_worker'];
    const sanitizedUpdates: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (field in updates) {
        sanitizedUpdates[field] = updates[field];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('profiles')
      .update(sanitizedUpdates)
      .eq('privy_id', privyId)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
