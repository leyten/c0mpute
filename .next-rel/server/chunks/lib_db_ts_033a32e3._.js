module.exports=[181579,e=>{"use strict";var t=e.i(785148),r=e.i(814747);e.i(952192);var a=e.i(639778);e.i(597946);var n=e.i(25238);let i=r.default.join(process.cwd(),"data","c0mpute.db"),E=null;function d(){return E||((E=new t.default(i)).pragma("journal_mode = WAL"),E.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        privy_id TEXT UNIQUE NOT NULL,
        wallet_address TEXT,
        x_username TEXT,
        x_id TEXT,
        is_worker INTEGER DEFAULT 0,
        prompts_sent INTEGER DEFAULT 0,
        zero_balance TEXT DEFAULT '0',
        balance_updated_at TEXT,
        total_sol_earned TEXT DEFAULT '0',
        jobs_completed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)),E}function o(e){let t=d().prepare("SELECT * FROM profiles WHERE privy_id = ?").get(e);return t&&t?{...t,is_worker:!!t.is_worker}:null}function T(e,t){let r=d(),a=[],n=[];for(let[e,r]of Object.entries(t))a.push(`${e} = ?`),n.push("is_worker"===e?+!!r:r);return a.push("updated_at = ?"),n.push(new Date().toISOString()),n.push(e),r.prepare(`UPDATE profiles SET ${a.join(", ")} WHERE privy_id = ?`).run(...n),o(e)}function _(e){let t=d(),r=new Date().toISOString(),a=crypto.randomUUID(),n=o(e.privy_id);if(n){let t={};return(void 0!==e.wallet_address&&(t.wallet_address=e.wallet_address),void 0!==e.x_username&&(t.x_username=e.x_username),void 0!==e.x_id&&(t.x_id=e.x_id),Object.keys(t).length>0)?T(e.privy_id,t):n}return t.prepare(`
    INSERT INTO profiles (id, privy_id, wallet_address, x_username, x_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(a,e.privy_id,e.wallet_address||null,e.x_username||null,e.x_id||null,r,r),o(e.privy_id)}function s(e){d().prepare("DELETE FROM profiles WHERE privy_id = ?").run(e)}function p(e,t){d().exec(`
    CREATE TABLE IF NOT EXISTS account_ip_daily (
      ip_hash TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (ip_hash, day)
    );
  `);let r=d(),a=new Date().toISOString().slice(0,10),n=r.prepare("SELECT count FROM account_ip_daily WHERE ip_hash = ? AND day = ?").get(e,a);return!((n?.count??0)>=t)&&(r.prepare(`
    INSERT INTO account_ip_daily (ip_hash, day, count) VALUES (?, ?, 1)
    ON CONFLICT(ip_hash, day) DO UPDATE SET count = count + 1
  `).run(e,a),!0)}function u(e,t){return T(e,{zero_balance:t,balance_updated_at:new Date().toISOString()})}function l(e){d().prepare("UPDATE profiles SET prompts_sent = prompts_sent + 1, updated_at = ? WHERE privy_id = ?").run(new Date().toISOString(),e)}function c(){let e=d();e.exec(`
    CREATE TABLE IF NOT EXISTS worker_stats (
      privy_id TEXT PRIMARY KEY,
      total_jobs INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      total_earning_points REAL DEFAULT 0,
      total_sol_paid TEXT DEFAULT '0',
      last_active_at TEXT,
      created_at TEXT NOT NULL
    );
  `),e.exec(`
    CREATE TABLE IF NOT EXISTS completed_jobs (
      id TEXT PRIMARY KEY,
      worker_privy_id TEXT NOT NULL,
      user_privy_id TEXT,
      model TEXT,
      tier TEXT,
      tokens_generated INTEGER NOT NULL,
      duration_ms INTEGER,
      earning_points REAL NOT NULL,
      completed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_completed_jobs_worker ON completed_jobs(worker_privy_id);
    CREATE INDEX IF NOT EXISTS idx_completed_jobs_user ON completed_jobs(user_privy_id);
    CREATE INDEX IF NOT EXISTS idx_completed_jobs_date ON completed_jobs(completed_at);
  `)}function N(e){c();let t=d(),r=t.prepare("SELECT COUNT(*) AS requests, COALESCE(SUM(tokens_generated), 0) AS tokens FROM completed_jobs WHERE user_privy_id = ?").get(e),a=t.prepare(`SELECT COALESCE(model, 'unknown') AS model, COUNT(*) AS requests, COALESCE(SUM(tokens_generated), 0) AS tokens
     FROM completed_jobs WHERE user_privy_id = ? GROUP BY model ORDER BY requests DESC`).all(e);return{totalRequests:r?.requests||0,totalTokens:r?.tokens||0,byModel:a}}function L(e){c();let t=d(),r=t.prepare("SELECT * FROM worker_stats WHERE privy_id = ?").get(e);if(!r)return null;let a=t.prepare("SELECT COUNT(*) AS c FROM worker_earnings WHERE privy_id = ?").get(e);return{totalJobs:r.total_jobs,paidJobs:a?.c??0,totalTokens:r.total_tokens,totalEarningPoints:r.total_earning_points,totalSolPaid:r.total_sol_paid,lastActiveAt:r.last_active_at}}function S(e,t=50){return c(),d().prepare("SELECT * FROM completed_jobs WHERE worker_privy_id = ? ORDER BY completed_at DESC LIMIT ?").all(e,t)}function O(){let e=d();e.exec(`
    CREATE TABLE IF NOT EXISTS worker_earnings (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      job_id TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      earning_usd REAL NOT NULL,
      created_at TEXT NOT NULL,
      subsidized INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_worker_earnings_privy ON worker_earnings(privy_id);
    CREATE INDEX IF NOT EXISTS idx_worker_earnings_date ON worker_earnings(created_at);

    CREATE TABLE IF NOT EXISTS worker_payouts (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      amount_sol REAL,
      sol_price_usd REAL,
      wallet_address TEXT,
      status TEXT DEFAULT 'pending_transfer',
      tx_hash TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS worker_wallets (
      privy_id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);try{e.exec("ALTER TABLE worker_earnings ADD COLUMN subsidized INTEGER NOT NULL DEFAULT 0")}catch{}try{e.exec("ALTER TABLE worker_earnings ADD COLUMN subsidy_kind TEXT")}catch{}}function R(){O();let e=d(),t=new Date;return t.setUTCHours(0,0,0,0),e.prepare("SELECT COALESCE(SUM(earning_usd), 0) as total FROM worker_earnings WHERE subsidized = 1 AND (subsidy_kind IS NULL OR subsidy_kind != 'allowance') AND created_at >= ?").get(t.toISOString()).total}function I(e){O();let t=d(),r=new Date;return r.setUTCHours(0,0,0,0),t.prepare("SELECT COALESCE(SUM(earning_usd), 0) as total FROM worker_earnings WHERE privy_id = ? AND created_at >= ?").get(e,r.toISOString()).total}function y(e){O();let t=d(),r=t.prepare("SELECT COALESCE(SUM(earning_usd), 0) as total FROM worker_earnings WHERE privy_id = ?").get(e),a=t.prepare("SELECT COALESCE(SUM(amount_usd), 0) as total FROM worker_payouts WHERE privy_id = ? AND status IN ('pending_transfer', 'completed')").get(e);return Math.max(0,r.total+(0,n.getReferralEarningsTotal)(e)-a.total)}function A(e){O();let t=d();t.transaction(()=>{t.prepare("DELETE FROM worker_earnings WHERE job_id = ?").run(e);try{t.prepare("DELETE FROM referral_earnings WHERE job_id = ?").run(e)}catch{}})()}function g(e){return O(),d().prepare("SELECT COALESCE(SUM(earning_usd), 0) as total FROM worker_earnings WHERE privy_id = ?").get(e).total}function U(e,t){O();let r=d();return r.transaction(()=>{let a=y(e);if(a<1)return null;let n=t||X(e);if(!n||r.prepare("SELECT id FROM worker_payouts WHERE privy_id = ? AND status = 'pending_transfer'").get(e))return null;let i=crypto.randomUUID(),E=new Date().toISOString();return r.prepare("INSERT INTO worker_payouts (id, privy_id, amount_usd, wallet_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(i,e,a,n,"pending_transfer",E),{payoutId:i,amountUsd:a}})()}function f(e,t,r){O();let n=d(),i=Math.round(100*r)/100;return n.transaction(()=>{if(i<a.MIN_WITHDRAWAL_USD)return{ok:!1,reason:"below_min"};if(n.prepare("SELECT id FROM worker_payouts WHERE privy_id = ? AND status = 'pending_transfer'").get(e))return{ok:!1,reason:"in_flight"};if(Math.round(100*y(e))/100+1e-9<i)return{ok:!1,reason:"insufficient"};let r=crypto.randomUUID(),E=new Date().toISOString();return n.prepare("INSERT INTO worker_payouts (id, privy_id, amount_usd, wallet_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(r,e,i,t,"pending_transfer",E),{ok:!0,payoutId:r,amount:i}})()}function D(e,t){O(),d().prepare("UPDATE worker_payouts SET status = 'completed', tx_hash = ?, completed_at = ? WHERE id = ? AND status = 'pending_transfer'").run(t,new Date().toISOString(),e)}function k(e){O(),d().prepare("UPDATE worker_payouts SET status = 'failed', completed_at = ? WHERE id = ? AND status = 'pending_transfer'").run(new Date().toISOString(),e)}function v(e,t=10){return O(),d().prepare("SELECT * FROM worker_payouts WHERE privy_id = ? ORDER BY created_at DESC LIMIT ?").all(e,t)}function C(e,t){O();let r=d(),a=new Date().toISOString();r.prepare("INSERT INTO worker_wallets (privy_id, wallet_address, updated_at) VALUES (?, ?, ?) ON CONFLICT(privy_id) DO UPDATE SET wallet_address = ?, updated_at = ?").run(e,t,a,t,a)}function X(e){O();let t=d().prepare("SELECT wallet_address FROM worker_wallets WHERE privy_id = ?").get(e);return t?.wallet_address||null}function m(e,t=20){return O(),d().prepare("SELECT * FROM worker_earnings WHERE privy_id = ? ORDER BY created_at DESC LIMIT ?").all(e,t)}function F(){d().exec(`
    CREATE TABLE IF NOT EXISTS worker_tokens (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT 'default',
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked INTEGER DEFAULT 0
    );
  `)}function w(t){return e.r(254799).createHash("sha256").update(t).digest("hex")}function h(t,r){F();let a=d(),n="cwt_"+e.r(254799).randomBytes(24).toString("base64url"),i=crypto.randomUUID(),E=new Date().toISOString();return a.prepare("INSERT INTO worker_tokens (id, privy_id, token_hash, name, created_at) VALUES (?, ?, ?, ?, ?)").run(i,t,w(n),r||"default",E),n}function M(e){F();let t=d(),r=w(e),a=t.prepare("SELECT privy_id FROM worker_tokens WHERE token_hash = ? AND revoked = 0").get(r);return a?(t.prepare("UPDATE worker_tokens SET last_used_at = ? WHERE token_hash = ?").run(new Date().toISOString(),r),a.privy_id):null}function W(e){return F(),d().prepare("SELECT id, name, created_at, last_used_at FROM worker_tokens WHERE privy_id = ? AND revoked = 0 ORDER BY created_at DESC").all(e)}function b(e,t){return F(),d().prepare("UPDATE worker_tokens SET revoked = 1 WHERE id = ? AND privy_id = ?").run(e,t).changes>0}function x(e,t){d().exec(`
    CREATE TABLE IF NOT EXISTS worker_identity (
      peer_id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      bound_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_worker_identity_privy ON worker_identity(privy_id);
  `),d().prepare(`INSERT INTO worker_identity (peer_id, privy_id, bound_at) VALUES (?, ?, ?)
     ON CONFLICT(peer_id) DO UPDATE SET privy_id = excluded.privy_id, bound_at = excluded.bound_at`).run(e,t,new Date().toISOString())}function P(e,t,r){d().exec(`
    CREATE TABLE IF NOT EXISTS node_role (
      peer_id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      verdict_json TEXT NOT NULL,
      cap_json TEXT NOT NULL,
      decided_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_node_role_role ON node_role(role);
  `),d().prepare(`INSERT INTO node_role (peer_id, role, verdict_json, cap_json, decided_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(peer_id) DO UPDATE SET role = excluded.role, verdict_json = excluded.verdict_json,
       cap_json = excluded.cap_json, decided_at = excluded.decided_at`).run(e,t.role,JSON.stringify(t),JSON.stringify(r),new Date().toISOString())}function H(){let e=d();e.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT 'default',
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS api_key_usage (
      key_id TEXT NOT NULL,
      day TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key_id, day)
    );
  `),e.prepare("PRAGMA table_info(api_keys)").all().some(e=>"free_only"===e.name)||e.exec("ALTER TABLE api_keys ADD COLUMN free_only INTEGER DEFAULT 0")}function Y(t,r,a=!1){H();let n=d(),i="sk-c0mpute-"+e.r(254799).randomBytes(24).toString("base64url"),E=crypto.randomUUID(),o=new Date().toISOString();return n.prepare("INSERT INTO api_keys (id, privy_id, key_hash, name, created_at, free_only) VALUES (?, ?, ?, ?, ?, ?)").run(E,t,w(i),r||"default",o,+!!a),i}function B(e){return K(e)?.privyId??null}function K(e){H();let t=d(),r=w(e),a=t.prepare("SELECT id, privy_id, free_only FROM api_keys WHERE key_hash = ? AND revoked = 0").get(r);return a?(t.prepare("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?").run(new Date().toISOString(),r),{privyId:a.privy_id,keyId:a.id,freeOnly:1===a.free_only}):null}function j(e){H();let t=d(),r=new Date().toISOString().slice(0,10);return t.prepare(`SELECT k.id, k.name, k.created_at, k.last_used_at, k.free_only,
            COALESCE(u.requests, 0) AS requests_today
       FROM api_keys k
       LEFT JOIN api_key_usage u ON u.key_id = k.id AND u.day = ?
      WHERE k.privy_id = ? AND k.revoked = 0
      ORDER BY k.created_at DESC`).all(r,e)}function G(e,t){return H(),d().prepare("UPDATE api_keys SET revoked = 1 WHERE id = ? AND privy_id = ?").run(e,t).changes>0}function V(e){H();let t=d(),r=new Date().toISOString().slice(0,10),a=t.prepare("SELECT requests FROM api_key_usage WHERE key_id = ? AND day = ?").get(e,r);return a?.requests??0}function q(e){H();let t=d(),r=new Date().toISOString().slice(0,10);return t.prepare(`INSERT INTO api_key_usage (key_id, day, requests) VALUES (?, ?, 1)
     ON CONFLICT(key_id, day) DO UPDATE SET requests = requests + 1`).run(e,r),V(e)}function J(){d().exec(`
    CREATE TABLE IF NOT EXISTS user_credits (
      privy_id TEXT PRIMARY KEY,
      balance REAL DEFAULT 0,
      total_deposited REAL DEFAULT 0,
      total_spent REAL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      privy_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      tx_hash TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_credit_tx_privy ON credit_transactions(privy_id);
    CREATE INDEX IF NOT EXISTS idx_credit_tx_date ON credit_transactions(created_at);

    CREATE TABLE IF NOT EXISTS deposit_wallets (
      privy_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      encrypted_secret TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deposit_progress (
      privy_id TEXT NOT NULL,
      mint TEXT NOT NULL,
      credited_amount REAL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (privy_id, mint)
    );
  `)}function z(e,t){J();let r=d().prepare("SELECT credited_amount FROM deposit_progress WHERE privy_id = ? AND mint = ?").get(e,t);return r?r.credited_amount:0}function Q(e,t,r){J();let a=d(),n=new Date().toISOString();a.prepare(`
    INSERT INTO deposit_progress (privy_id, mint, credited_amount, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(privy_id, mint) DO UPDATE SET credited_amount = ?, updated_at = ?
  `).run(e,t,r,n,r,n)}function $(t){J();let r=d(),a=r.prepare("SELECT public_key FROM deposit_wallets WHERE privy_id = ?").get(t);if(a)return a.public_key;let{Keypair:n}=e.r(696399),i=e.r(254799),E=n.generate(),o=E.publicKey.toBase58(),T=process.env.DEPOSIT_WALLET_KEY;if(!T)throw Error("[Credits] FATAL: DEPOSIT_WALLET_KEY not set. Cannot generate deposit wallets without encryption key.");let _=i.randomBytes(16),s=i.createCipheriv("aes-256-gcm",Buffer.from(T,"hex"),_),p=s.update(Buffer.from(E.secretKey));p=Buffer.concat([p,s.final()]);let u=s.getAuthTag(),l=_.toString("hex")+":"+u.toString("hex")+":"+p.toString("hex"),c=new Date().toISOString();return r.prepare("INSERT INTO deposit_wallets (privy_id, public_key, encrypted_secret, created_at) VALUES (?, ?, ?, ?)").run(t,o,l,c),o}function Z(t){J();let r=d().prepare("SELECT encrypted_secret FROM deposit_wallets WHERE privy_id = ?").get(t);if(!r)return null;let a=process.env.DEPOSIT_WALLET_KEY;if(!a)throw Error("[Credits] DEPOSIT_WALLET_KEY not set");let n=e.r(254799),[i,E,o]=r.encrypted_secret.split(":"),T=n.createDecipheriv("aes-256-gcm",Buffer.from(a,"hex"),Buffer.from(i,"hex"));return T.setAuthTag(Buffer.from(E,"hex")),new Uint8Array(Buffer.concat([T.update(Buffer.from(o,"hex")),T.final()]))}function ee(e){J();let t=d().prepare("SELECT * FROM user_credits WHERE privy_id = ?").get(e);return t?{balance:t.balance,totalDeposited:t.total_deposited,totalSpent:t.total_spent}:{balance:0,totalDeposited:0,totalSpent:0}}function et(e,t,r,a){if(!Number.isFinite(t)||t<=0)throw Error(`addCredits: refusing non-positive/non-finite amount (${t})`);J();let n=d(),i=new Date().toISOString();n.transaction(()=>{n.prepare(`
      INSERT INTO user_credits (privy_id, balance, total_deposited, total_spent, updated_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(privy_id) DO UPDATE SET
        balance = balance + ?,
        total_deposited = total_deposited + ?,
        updated_at = ?
    `).run(e,t,t,i,t,t,i);let E=crypto.randomUUID();n.prepare("INSERT INTO credit_transactions (id, privy_id, type, amount, description, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(E,e,"deposit",t,a||"Token deposit",r||null,i)})()}function er(e,t,r){if(!Number.isFinite(t)||t<=0)return!1;J();let a=d(),n=new Date().toISOString();return a.transaction(()=>{let i=a.prepare("SELECT balance FROM user_credits WHERE privy_id = ?").get(e);if(!i||i.balance<t)return!1;a.prepare("UPDATE user_credits SET balance = balance - ?, total_spent = total_spent + ?, updated_at = ? WHERE privy_id = ?").run(t,t,n,e);let E=crypto.randomUUID();return a.prepare("INSERT INTO credit_transactions (id, privy_id, type, amount, description, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(E,e,"spend",t,r||"Prompt",null,n),!0})()}function ea(e,t,r){if(!Number.isFinite(t)||t<=0)return;J();let a=d(),n=new Date().toISOString();a.transaction(()=>{a.prepare(`
      INSERT INTO user_credits (privy_id, balance, total_deposited, total_spent, updated_at)
      VALUES (?, ?, 0, 0, ?)
      ON CONFLICT(privy_id) DO UPDATE SET
        balance = balance + ?,
        total_spent = total_spent - ?,
        updated_at = ?
    `).run(e,t,n,t,t,n);let i=crypto.randomUUID();a.prepare("INSERT INTO credit_transactions (id, privy_id, type, amount, description, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(i,e,"refund",t,r||"Refund",null,n)})()}function en(){d().exec(`
    CREATE TABLE IF NOT EXISTS free_prompt_usage (
      privy_id TEXT PRIMARY KEY,
      used INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `)}function ei(e){en();let t=d().prepare("SELECT used FROM free_prompt_usage WHERE privy_id = ?").get(e);return t?t.used:0}function eE(){d().exec(`
    CREATE TABLE IF NOT EXISTS free_image_usage (
      privy_id TEXT PRIMARY KEY,
      used INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `)}function ed(e){eE();let t=d().prepare("SELECT used FROM free_image_usage WHERE privy_id = ?").get(e);return t?t.used:0}function eo(e,t){eE();let r=d(),a=new Date().toISOString();return r.transaction(()=>{let n=r.prepare("SELECT used FROM free_image_usage WHERE privy_id = ?").get(e);return!((n?n.used:0)>=t)&&(r.prepare(`
      INSERT INTO free_image_usage (privy_id, used, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(privy_id) DO UPDATE SET used = used + 1, updated_at = ?
    `).run(e,a,a),!0)})()}function eT(e){eE(),d().prepare("UPDATE free_image_usage SET used = MAX(0, used - 1) WHERE privy_id = ?").run(e)}function e_(e,t){en();let r=d().prepare("SELECT used FROM free_prompt_usage WHERE privy_id = ?").get("anon:"+e);return Math.max(0,t-(r?r.used:0))}function es(e,t=20){return J(),d().prepare("SELECT * FROM credit_transactions WHERE privy_id = ? ORDER BY created_at DESC LIMIT ?").all(e,t)}e.s(["addCredits",()=>et,"bindPeerId",()=>x,"bumpApiKeyRequest",()=>q,"consumeFreeImage",()=>eo,"createApiKey",()=>Y,"createWithdrawal",()=>f,"createWorkerToken",()=>h,"deleteProfile",()=>s,"getAnonRemaining",()=>e_,"getApiKeyRequestsToday",()=>V,"getApiKeys",()=>j,"getCreditBalance",()=>ee,"getCreditTransactions",()=>es,"getDepositProgress",()=>z,"getDepositWalletSecret",()=>Z,"getFreeImagesUsed",()=>ed,"getFreePromptsUsed",()=>ei,"getOrCreateDepositWallet",()=>$,"getPayoutHistory",()=>v,"getPendingBalance",()=>y,"getProfileByPrivyId",()=>o,"getRecentEarnings",()=>m,"getTodayEarnings",()=>I,"getTodayFreeSubsidyUsd",()=>R,"getTotalEarnings",()=>g,"getUserUsage",()=>N,"getWorkerJobHistory",()=>S,"getWorkerStats",()=>L,"getWorkerTokens",()=>W,"getWorkerWallet",()=>X,"incrementPromptsSent",()=>l,"markPayoutCompleted",()=>D,"markPayoutFailed",()=>k,"recordNewAccountForIp",()=>p,"refundCredits",()=>ea,"refundFreeImage",()=>eT,"requestPayout",()=>U,"resolveApiKey",()=>B,"resolveApiKeyFull",()=>K,"reverseWorkerEarning",()=>A,"revokeApiKey",()=>G,"revokeWorkerToken",()=>b,"setDepositProgress",()=>Q,"setNodeRole",()=>P,"setWorkerWallet",()=>C,"spendCredits",()=>er,"updateBalance",()=>u,"updateProfile",()=>T,"upsertProfile",()=>_,"verifyWorkerToken",()=>M])}];

//# sourceMappingURL=lib_db_ts_033a32e3._.js.map