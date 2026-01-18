export interface Profile {
  id: string;
  privy_id: string;
  wallet_address: string | null;
  x_username: string | null;
  x_id: string | null;
  is_worker: boolean;
  prompts_sent: number;
  zero_balance: number;
  balance_updated_at: string | null;
  total_sol_earned: number;
  jobs_completed: number;
  created_at: string;
  updated_at: string;
}
