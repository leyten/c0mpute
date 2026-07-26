'use client';

// The scope's data. Nothing is invented here: the only input is the session
// token counter the engine already publishes, sampled on a fixed 1 Hz clock and
// differenced, which is what a throughput reading is.
//
// The window holds 60 slots but reports how many of them were measured, because
// a trace that starts as a full 60 seconds of flat zero would be drawing 59
// seconds of history that never happened. Until the window fills, only the
// measured tail is drawn.
import { useEffect, useRef, useState } from 'react';

export const TRACE_WINDOW = 60;

const zeros = () => new Array<number>(TRACE_WINDOW).fill(0);

export interface Trace {
  /** Oldest to newest, one slot per second. The first `TRACE_WINDOW - filled`
   *  entries are padding, not readings, and must not be drawn. */
  samples: number[];
  /** How many of the slots hold a measurement. */
  filled: number;
  /** The most recent sample, tokens per second. */
  rate: number;
  /** Highest measured sample still inside the window. */
  peak: number;
}

/** Samples `tokens` once a second while `armed`, and reports the derivative. */
export function useTokenTrace(tokens: number, armed: boolean): Trace {
  const [samples, setSamples] = useState<number[]>(zeros);
  const [filled, setFilled] = useState(0);
  const tokensRef = useRef(tokens);
  const prev = useRef({ tokens, at: Date.now() });

  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

  useEffect(() => {
    setSamples(zeros());
    setFilled(0);
    if (!armed) return;
    prev.current = { tokens: tokensRef.current, at: Date.now() };
    const id = setInterval(() => {
      const now = Date.now();
      const seen = tokensRef.current;
      const seconds = (now - prev.current.at) / 1000;
      const produced = Math.max(0, seen - prev.current.tokens);
      prev.current = { tokens: seen, at: now };
      const rate = seconds > 0 ? produced / seconds : 0;
      setSamples((s) => [...s.slice(1), rate]);
      setFilled((f) => Math.min(TRACE_WINDOW, f + 1));
    }, 1000);
    return () => clearInterval(id);
  }, [armed]);

  const measured = filled > 0 ? samples.slice(TRACE_WINDOW - filled) : [];

  return {
    samples,
    filled,
    rate: measured.length > 0 ? measured[measured.length - 1] : 0,
    peak: measured.reduce((a, b) => (b > a ? b : a), 0),
  };
}
