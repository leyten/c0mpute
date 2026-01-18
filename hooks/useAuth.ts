'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useState, useEffect, useCallback } from 'react';
import { Profile } from '@/lib/supabase/types';

interface UseAuthReturn {
  // Privy state
  isLoading: boolean;
  isAuthenticated: boolean;
  user: ReturnType<typeof usePrivy>['user'];
  login: () => void;
  logout: () => Promise<void>;
  
  // Profile state
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string | null;
  
  // Actions
  refreshProfile: () => Promise<void>;
  refreshBalance: () => Promise<{ balance: number; cached: boolean } | null>;
  toggleWorkerMode: () => Promise<void>;
  
  // Helpers
  displayName: string | null;
  walletAddress: string | null;
  xUsername: string | null;
}

export function useAuth(): UseAuthReturn {
  const { ready, authenticated, user, login, logout: privyLogout } = usePrivy();
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Fetch profile from Supabase
  const refreshProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    try {
      const response = await fetch(`/api/profile?privyId=${user.id}`);
      
      if (response.ok) {
        const data = await response.json();
        setProfile(data.profile);
      } else if (response.status === 404) {
        // Profile doesn't exist yet, will be created on next login
        setProfile(null);
      } else {
        throw new Error('Failed to fetch profile');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfileError('Failed to load profile');
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id]);

  // Refresh $ZERO balance
  const refreshBalance = useCallback(async () => {
    if (!user?.id) return null;

    try {
      const response = await fetch('/api/profile/refresh-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyId: user.id }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update local profile with new balance
        setProfile(prev => prev ? {
          ...prev,
          zero_balance: data.balance,
          balance_updated_at: data.updated_at,
        } : null);
        return { balance: data.balance, cached: data.cached };
      }
    } catch (error) {
      console.error('Error refreshing balance:', error);
    }
    return null;
  }, [user?.id]);

  // Toggle worker mode
  const toggleWorkerMode = useCallback(async () => {
    if (!user?.id || !profile) return;

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privyId: user.id,
          is_worker: !profile.is_worker,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data.profile);
      }
    } catch (error) {
      console.error('Error toggling worker mode:', error);
    }
  }, [user?.id, profile]);

  // Logout and clear profile
  const logout = useCallback(async () => {
    await privyLogout();
    setProfile(null);
  }, [privyLogout]);

  // Sync user to database and fetch profile when authenticated
  useEffect(() => {
    const syncAndFetchProfile = async () => {
      if (!ready || !authenticated || !user?.id) {
        if (ready && !authenticated) {
          setProfile(null);
        }
        return;
      }

      // Sync user to Supabase
      try {
        await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            privyId: user.id,
            wallet: user.wallet?.address,
            twitter: user.twitter ? {
              username: user.twitter.username,
              id: user.twitter.subject,
            } : null,
          }),
        });
      } catch (error) {
        console.error('Failed to sync user to database:', error);
      }

      // Then fetch the profile
      refreshProfile();
    };

    syncAndFetchProfile();
  }, [ready, authenticated, user?.id, user?.wallet?.address, user?.twitter?.username, user?.twitter?.subject, refreshProfile]);

  // Derived values
  const walletAddress = user?.wallet?.address || profile?.wallet_address || null;
  const xUsername = user?.twitter?.username || profile?.x_username || null;
  
  const displayName = xUsername 
    ? `@${xUsername}` 
    : walletAddress 
      ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
      : null;

  return {
    // Privy state
    isLoading: !ready,
    isAuthenticated: authenticated,
    user,
    login,
    logout,
    
    // Profile state
    profile,
    profileLoading,
    profileError,
    
    // Actions
    refreshProfile,
    refreshBalance,
    toggleWorkerMode,
    
    // Helpers
    displayName,
    walletAddress,
    xUsername,
  };
}
