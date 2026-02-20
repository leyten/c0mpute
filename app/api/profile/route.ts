import { NextRequest, NextResponse } from 'next/server';
import { getProfileByPrivyId, updateProfile } from '@/lib/db';
import { getAuthUserId } from '@/lib/privy-server';

export async function GET(request: NextRequest) {
  try {
    // Verify auth — user can only access their own profile
    const authUserId = await getAuthUserId(request);
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Use the authenticated user's ID, not a query parameter
    const profile = getProfileByPrivyId(authUserId);

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ profile });
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
    // Verify auth
    const authUserId = await getAuthUserId(request);
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Only allow updating certain fields
    const allowedFields = ['is_worker'];
    const sanitizedUpdates: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (field in body) {
        sanitizedUpdates[field] = body[field];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Use authenticated user's ID
    const profile = updateProfile(authUserId, sanitizedUpdates);

    if (!profile) {
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
