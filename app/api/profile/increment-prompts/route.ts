import { NextRequest, NextResponse } from 'next/server';
import { incrementPromptsSent } from '@/lib/db';
import { getAuthUserId } from '@/lib/privy-server';

export async function POST(request: NextRequest) {
  try {
    // Verify auth — only increment for the authenticated user
    const authUserId = await getAuthUserId(request);
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    incrementPromptsSent(authUserId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Increment prompts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
