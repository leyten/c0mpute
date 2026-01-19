import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
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

    // Delete the user's profile from the database
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('privy_id', privyId);

    if (error) {
      console.error('Error deleting profile:', error);
      return NextResponse.json(
        { error: 'Failed to delete profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
