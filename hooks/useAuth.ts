'use client';

import { usePrivy, useLinkAccount } from '@privy-io/react-auth';
import { useState, useEffect, useCallback } from 'react';
import { Profile } from '@/lib/types';

interface UseAuthReturn {
  // Privy state
  isLoading: boolean;
  isAuthenticated: boolean;
  user: ReturnType<typeof usePrivy>['user'];
  login: () => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  
  // Profile state
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string | null;
  
  // Actions
  refreshProfile: () => Promise<void>;
  refreshBalance: () => Promise<{ balance: number; cached: boolean } | null>;
  toggleWorkerMode: () => Promise<void>;
  
  // Linking actions
  linkWallet: () => void;
  linkTwitter: () => void;
  unlinkWallet: (address: string) => Promise<void>;
  unlinkTwitter: (subject: string) => Promise<void>;
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  
  // Helpers
  displayName: string | null;
  walletAddress: string | null;
  xUsername: string | null;
  hasWallet: boolean;
  hasTwitter: boolean;
}

export function useAuth(): UseAuthReturn {
  const { ready, authenticated, user, login, logout: privyLogout, unlinkWallet: privyUnlinkWallet, unlinkTwitter: privyUnlinkTwitter, getAccessToken: privyGetAccessToken } = usePrivy();
  const { linkWallet, linkTwitter } = useLinkAccount();
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Helper to get auth headers
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const token = await privyGetAccessToken();
      if (token) {
        return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      }
    } catch {}
    return { 'Content-Type': 'application/json' };
  }, [privyGetAccessToken]);

  // Fetch profile
  const refreshProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/profile', { headers });
      
      if (response.ok) {
        const data = await response.json();
        setProfile(data.profile);
      } else if (response.status === 404) {
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
  }, [user?.id, getAuthHeaders]);

  // Refresh $ZERO balance
  const refreshBalance = useCallback(async () => {
    if (!user?.id) return null;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/profile/refresh-balance', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
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
  }, [user?.id, getAuthHeaders]);

  // Toggle worker mode
  const toggleWorkerMode = useCallback(async () => {
    if (!user?.id || !profile) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
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
  }, [user?.id, profile, getAuthHeaders]);

  // Logout and clear profile
  const logout = useCallback(async () => {
    await privyLogout();
    setProfile(null);
  }, [privyLogout]);

  // Unlink wallet
  const unlinkWallet = useCallback(async (address: string) => {
    try {
      await privyUnlinkWallet(address);
      // Refresh profile after unlinking
      setTimeout(() => refreshProfile(), 500);
    } catch (error) {
      console.error('Error unlinking wallet:', error);
      throw error;
    }
  }, [privyUnlinkWallet, refreshProfile]);

  // Unlink Twitter
  const unlinkTwitter = useCallback(async (subject: string) => {
    try {
      await privyUnlinkTwitter(subject);
      // Refresh profile after unlinking
      setTimeout(() => refreshProfile(), 500);
    } catch (error) {
      console.error('Error unlinking Twitter:', error);
      throw error;
    }
  }, [privyUnlinkTwitter, refreshProfile]);

  // Delete account
  const deleteAccount = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!user?.id) return { ok: false, error: 'Not logged in.' };

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/profile/delete', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({}),
      });

      if (response.ok) {
        await privyLogout();
        setProfile(null);
        return { ok: true };
      }
      const data = await response.json().catch(() => ({}));
      return { ok: false, error: data.message || data.error || 'Failed to delete account.' };
    } catch (error) {
      console.error('Error deleting account:', error);
      return { ok: false, error: 'Failed to delete account.' };
    }
  }, [user?.id, privyLogout, getAuthHeaders]);

  // Sync user to database and fetch profile when authenticated
  useEffect(() => {
    const syncAndFetchProfile = async () => {
      if (!ready || !authenticated || !user?.id) {
        if (ready && !authenticated) {
          setProfile(null);
        }
        return;
      }

      // Sync user to database
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/auth/callback', {
          method: 'POST',
          headers,
          body: JSON.stringify({
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
  }, [ready, authenticated, user?.id, user?.wallet?.address, user?.twitter?.username, user?.twitter?.subject, refreshProfile, getAuthHeaders]);

  // Derived values
  const walletAddress = user?.wallet?.address || profile?.wallet_address || null;
  const xUsername = user?.twitter?.username || profile?.x_username || null;
  const hasWallet = !!user?.wallet?.address;
  const hasTwitter = !!user?.twitter?.username;
  
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
    getAccessToken: privyGetAccessToken,
    
    // Profile state
    profile,
    profileLoading,
    profileError,
    
    // Actions
    refreshProfile,
    refreshBalance,
    toggleWorkerMode,
    
    // Linking actions
    linkWallet,
    linkTwitter,
    unlinkWallet,
    unlinkTwitter,
    deleteAccount,
    
    // Helpers
    displayName,
    walletAddress,
    xUsername,
    hasWallet,
    hasTwitter,
  };
}
