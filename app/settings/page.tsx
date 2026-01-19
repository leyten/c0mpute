'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

type Tab = 'profile'; // Future: | 'worker' | 'usage'

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);
  const [linkingTwitter, setLinkingTwitter] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  
  const {
    isLoading,
    isAuthenticated,
    user,
    logout,
    profile,
    walletAddress,
    xUsername,
    hasWallet,
    hasTwitter,
    linkWallet,
    linkTwitter,
    deleteAccount,
    refreshProfile,
  } = useAuth();

  // Check if wallet is embedded (created by Privy) vs external
  const isEmbeddedWallet = user?.wallet?.walletClientType === 'privy';

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // Redirect to home if not authenticated
  if (!isLoading && !isAuthenticated) {
    router.push('/');
    return null;
  }

  const handleLinkWallet = async () => {
    setLinkingWallet(true);
    try {
      await linkWallet();
      // Privy will handle the modal, refresh profile after
      setTimeout(() => {
        refreshProfile();
        setLinkingWallet(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to link wallet:', error);
      setLinkingWallet(false);
    }
  };

  const handleLinkTwitter = async () => {
    setLinkingTwitter(true);
    try {
      await linkTwitter();
      // Privy will handle the modal, refresh profile after
      setTimeout(() => {
        refreshProfile();
        setLinkingTwitter(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to link Twitter:', error);
      setLinkingTwitter(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    const success = await deleteAccount();
    if (success) {
      router.push('/');
    } else {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'profile', label: 'Profile' },
    // Future tabs:
    // { id: 'worker', label: 'Worker', disabled: true },
    // { id: 'usage', label: 'Usage', disabled: true },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="pixel-sans text-white/50">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 px-4 md:px-6 py-3 flex items-center justify-between">
            {/* Left: Logo */}
            <div className="flex-1">
              <a href="/" className="pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
                C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
              </a>
            </div>
            
            {/* Right: Back button */}
            <button 
              onClick={() => router.push('/')}
              className="pixel-sans text-sm text-white/70 hover:text-white transition-colors"
            >
              ← Back
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">
          {/* Page Title */}
          <h1 className="pixel-serif text-white text-3xl md:text-4xl mb-8">Settings</h1>
          
          {/* Tabs */}
          <div className="flex gap-1 mb-8 border-b border-white/10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`pixel-sans text-sm px-4 py-3 transition-colors relative ${
                  activeTab === tab.id 
                    ? 'text-white' 
                    : tab.disabled 
                      ? 'text-white/20 cursor-not-allowed' 
                      : 'text-white/50 hover:text-white/70'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-white" />
                )}
              </button>
            ))}
          </div>

          {/* Profile Tab Content */}
          {activeTab === 'profile' && (
            <div className="space-y-8">
              {/* Connected Accounts Section */}
              <section className="border border-white/10 bg-white/[0.02] p-6">
                <h2 className="pixel-serif text-white text-xl mb-6">Connected Accounts</h2>
                
                <div className="space-y-4">
                  {/* Wallet Connection */}
                  <div className="flex items-center justify-between py-3 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/70">
                          <rect x="2" y="6" width="20" height="14" rx="2" />
                          <path d="M16 14h2" />
                          <path d="M2 10h20" />
                        </svg>
                      </div>
                      <div>
                        <div className="pixel-sans text-white text-sm flex items-center gap-2">
                          Solana Wallet
                          {hasWallet && isEmbeddedWallet && (
                            <span className="text-white/30 text-xs">(Privy)</span>
                          )}
                        </div>
                        {hasWallet ? (
                          <button 
                            onClick={() => walletAddress && copyToClipboard(walletAddress, 'wallet')}
                            className="pixel-sans text-white/50 hover:text-white/70 text-xs mt-1 flex items-center gap-1 transition-colors"
                          >
                            {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-8)}
                            {copied === 'wallet' ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                            )}
                          </button>
                        ) : (
                          <div className="pixel-sans text-white/30 text-xs mt-1">Not connected</div>
                        )}
                      </div>
                    </div>
                    
                    {!hasWallet && (
                      <button
                        onClick={handleLinkWallet}
                        disabled={linkingWallet}
                        className="pixel-sans text-xs px-4 py-2 border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        {linkingWallet ? '...' : 'Link Wallet'}
                      </button>
                    )}
                    {hasWallet && !isEmbeddedWallet && (
                      <div className="pixel-sans text-xs text-white/30">Connected</div>
                    )}
                    {hasWallet && isEmbeddedWallet && (
                      <button
                        onClick={handleLinkWallet}
                        disabled={linkingWallet}
                        className="pixel-sans text-xs px-4 py-2 border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        {linkingWallet ? '...' : 'Link External'}
                      </button>
                    )}
                  </div>

                  {/* X (Twitter) Connection */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white/70">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </div>
                      <div>
                        <div className="pixel-sans text-white text-sm">X (Twitter)</div>
                        {hasTwitter ? (
                          <div className="pixel-sans text-white/50 text-xs mt-1">@{xUsername}</div>
                        ) : (
                          <div className="pixel-sans text-white/30 text-xs mt-1">Not connected</div>
                        )}
                      </div>
                    </div>
                    
                    {!hasTwitter && (
                      <button
                        onClick={handleLinkTwitter}
                        disabled={linkingTwitter}
                        className="pixel-sans text-xs px-4 py-2 border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        {linkingTwitter ? '...' : 'Link X'}
                      </button>
                    )}
                    {hasTwitter && (
                      <div className="pixel-sans text-xs text-white/30">Connected</div>
                    )}
                  </div>
                </div>
              </section>

              {/* Account Info Section */}
              <section className="border border-white/10 bg-white/[0.02] p-6">
                <h2 className="pixel-serif text-white text-xl mb-6">Account Info</h2>
                
                <div className="space-y-4">
                  <div className="flex justify-between py-2">
                    <span className="pixel-sans text-white/50 text-sm">Privy ID</span>
                    <button 
                      onClick={() => user?.id && copyToClipboard(user.id, 'privy')}
                      className="pixel-sans text-white/70 hover:text-white text-sm font-mono flex items-center gap-1 transition-colors"
                    >
                      {user?.id?.slice(0, 12)}...
                      {copied === 'privy' ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                  
                  <div className="flex justify-between py-2">
                    <span className="pixel-sans text-white/50 text-sm">Member Since</span>
                    <span className="pixel-sans text-white/70 text-sm">
                      {profile?.created_at 
                        ? new Date(profile.created_at).toLocaleDateString() 
                        : '—'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between py-2">
                    <span className="pixel-sans text-white/50 text-sm">Prompts Sent</span>
                    <span className="pixel-sans text-white/70 text-sm">
                      {profile?.prompts_sent ?? 0}
                    </span>
                  </div>
                </div>
              </section>

              {/* Danger Zone */}
              <section className="border border-red-500/20 bg-red-500/[0.02] p-6">
                <h2 className="pixel-serif text-red-400/80 text-xl mb-4">Danger Zone</h2>
                <p className="pixel-sans text-white/50 text-sm mb-6">
                  Once you delete your account, there is no going back. This will permanently delete your profile and all associated data.
                </p>
                
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="pixel-sans text-sm px-4 py-2 border border-red-500/30 text-red-400/80 hover:bg-red-500/10 transition-colors"
                  >
                    Delete Account
                  </button>
                ) : (
                  <div className="space-y-4">
                    <p className="pixel-sans text-red-400/80 text-sm">
                      Are you sure? This action cannot be undone.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteLoading}
                        className="pixel-sans text-sm px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                      >
                        {deleteLoading ? 'Deleting...' : 'Yes, Delete My Account'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={deleteLoading}
                        className="pixel-sans text-sm px-4 py-2 border border-white/20 text-white/70 hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
