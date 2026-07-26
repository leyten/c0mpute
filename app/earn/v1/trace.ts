'use client';

// The scope's data. Nothing is invented here: the only input is the session
// token counter the engine already publishes, sampled on a fixed 1 Hz clock and
// differenced, which is what a throughput reading is. A machine that is bound
// but idle reads zero, not a gap, so the baseline stays on the display.
import { useEffect, useRef, useState } from 'react';

export const TRACE_WINDOW = 60;

const zeros = () => new Array<number>(TRACE_WINDOW).fill(0);

export interface Trace {
  /** Oldest to newest, one sample per second. */
  samples: number[];
  /** The most recent sample, tokens per second. */
  rate: number;
  /** Highest sample still inside the window. */
  peak: number;
}

/** Samples `tokens` once a second while `armed`, and reports the derivative. */
export function useTokenTrace(tokens: number, armed: boolean): Trace {
  const [samples, setSamples] = useState<number[]>(zeros);
  const tokensRef = useRef(tokens);
  const prev = useRef({ tokens, at: Date.now() });

  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

  useEffect(() => {
    if (!armed) {
      setSamples(zeros());
      return;
    }
    prev.current = { tokens: tokensRef.current, at: Date.now() };
    setSamples(zeros());
    const id = setInterval(() => {
      const now = Date.now();
      const seen = tokensRef.current;
      const seconds = (now - prev.current.at) / 1000;
      const produced = Math.max(0, seen - prev.current.tokens);
      prev.current = { tokens: seen, at: now };
      const rate = seconds > 0 ? produced / seconds : 0;
      setSamples((s) => [...s.slice(1), rate]);
    }, 1000);
    return () => clearInterval(id);
  }, [armed]);

  return {
    samples,
    rate: samples[samples.length - 1] ?? 0,
    peak: samples.reduce((a, b) => (b > a ? b : a), 0),
  };
}
