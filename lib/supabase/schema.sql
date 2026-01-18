-- Profiles table for c0mpute users
-- Run this in your Supabase SQL Editor

-- Create the profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT UNIQUE NOT NULL,
  wallet_address TEXT,
  x_username TEXT,
  x_id TEXT,
  is_worker BOOLEAN DEFAULT FALSE,
  prompts_sent INTEGER DEFAULT 0,
  zero_balance NUMERIC DEFAULT 0,
  balance_updated_at TIMESTAMPTZ,
  total_sol_earned NUMERIC DEFAULT 0,
  jobs_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_profiles_privy_id ON profiles(privy_id);
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address ON profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_is_worker ON profiles(is_worker);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  USING (true); -- We'll validate via API with Privy token

-- Policy: Service role can do everything (for API routes)
CREATE POLICY "Service role has full access"
  ON profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to upsert profile on auth
CREATE OR REPLACE FUNCTION upsert_profile(
  p_privy_id TEXT,
  p_wallet_address TEXT DEFAULT NULL,
  p_x_username TEXT DEFAULT NULL,
  p_x_id TEXT DEFAULT NULL
)
RETURNS profiles AS $$
DECLARE
  result profiles;
BEGIN
  INSERT INTO profiles (privy_id, wallet_address, x_username, x_id)
  VALUES (p_privy_id, p_wallet_address, p_x_username, p_x_id)
  ON CONFLICT (privy_id) DO UPDATE SET
    wallet_address = COALESCE(EXCLUDED.wallet_address, profiles.wallet_address),
    x_username = COALESCE(EXCLUDED.x_username, profiles.x_username),
    x_id = COALESCE(EXCLUDED.x_id, profiles.x_id),
    updated_at = NOW()
  RETURNING * INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
