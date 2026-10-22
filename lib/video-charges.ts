// Refunds for Studio renders, shared by the web route (a submit that was never
// accepted) and the orchestrator (every failure after that, and the startup
// sweep), so all of them give the charge back the same way and only once.
// The row in video_charges (lib/db.ts) carries the lane and the day the charge
// was drawn on, so a refund minutes or a restart later settles against the
// row that was actually charged.

import { closeVideoCharge, listPendingVideoCharges, refundCredits } from './db';
import { refundDailyGrant } from './plan-state';
import { refundStakerAllowance } from './staker-allowance';

/** Give a pending Studio charge back to the lane that paid it. True only for
 *  the call that actually refunded. The latch flips before the lane moves, so
 *  a crash in between loses this one refund rather than ever paying twice. */
export function refundVideoCharge(jobId: string, reason: string): boolean {
  const row = closeVideoCharge(jobId, 'refunded');
  if (!row) return false;
  if (row.lane === 'plan' || row.lane === 'free_grant') {
    refundDailyGrant(row.privy_id, row.lane === 'plan' ? 'plan' : 'free', row.credits, row.charge_day ?? undefined);
  } else if (row.lane === 'allowance') {
    refundStakerAllowance(row.privy_id, row.credits, row.charge_day ?? undefined);
  } else {
    refundCredits(row.privy_id, row.credits, reason);
  }
  return true;
}

/** Orchestrator startup: a fresh process has nothing in flight, so every
 *  charge still pending belongs to a render that died with the last one. */
export function refundOrphanedVideoCharges(): number {
  let refunded = 0;
  for (const row of listPendingVideoCharges()) {
    if (refundVideoCharge(row.job_id, 'Video generation interrupted by a restart')) refunded++;
  }
  return refunded;
}
