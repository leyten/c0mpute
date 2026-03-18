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

export interface Chat {
  id: string;
  privy_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];  // base64-encoded images (vision)
  job_id: string | null;
  created_at: string;
}

export interface ChatWithMessages extends Chat {
  messages: Message[];
}
