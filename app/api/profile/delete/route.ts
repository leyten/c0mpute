import { NextRequest, NextResponse } from 'next/server';
import { deleteProfile } from '@/lib/db';
import { getAuthUserId } from '@/lib/privy-server';

export async function DELETE(request: NextRequest) {
  try {
    // Verify auth — only delete own account
    const authUserId = await getAuthUserId(request);
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    deleteProfile(authUserId);

    return NextResponse.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
