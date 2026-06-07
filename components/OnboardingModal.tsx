'use client';

import { useState } from 'react';

interface OnboardingModalProps {
  freePromptLimit: number;
  onClose: () => void;
  onChooseWorker: () => void;
}

export default function OnboardingModal({ freePromptLimit, onClose, onChooseWorker }: OnboardingModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-7 shadow-2xl">
        {step === 1 ? (
          <>
            <div className="pixel-sans text-white text-xl font-bold mb-3">Welcome to c0mpute</div>
            <p className="pixel-sans text-white/70 text-sm leading-relaxed mb-5">
              c0mpute is a decentralized AI network. You run prompts on real models served by
              people sharing their compute. To get you started, your account comes with{' '}
              <span className="text-green-400 font-semibold">{freePromptLimit} free prompts</span> — no card, no deposit.
            </p>
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3">
                <span className="pixel-sans text-green-400/80 text-sm font-bold mt-0.5">1.</span>
                <span className="pixel-sans text-white/60 text-sm">Type a prompt and pick a model. Your free prompts work on every tier.</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="pixel-sans text-green-400/80 text-sm font-bold mt-0.5">2.</span>
                <span className="pixel-sans text-white/60 text-sm">When they run out, top up with USDC. Credits never expire.</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="pixel-sans text-green-400/80 text-sm font-bold mt-0.5">3.</span>
                <span className="pixel-sans text-white/60 text-sm">Got a GPU? You can earn by serving prompts for the network.</span>
              </div>
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full pixel-serif py-3 rounded-xl bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
            >
              Next
            </button>
          </>
        ) : (
          <>
            <div className="pixel-sans text-white text-xl font-bold mb-3">How do you want to start?</div>
            <p className="pixel-sans text-white/60 text-sm mb-5">You can do both — pick where to go first.</p>
            <div className="space-y-3 mb-6">
              <button
                onClick={onClose}
                className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 transition-colors p-4 cursor-pointer"
              >
                <div className="pixel-serif text-white text-lg mb-1">Use AI</div>
                <div className="pixel-sans text-white/55 text-sm">Start chatting now with your {freePromptLimit} free prompts.</div>
              </button>
              <button
                onClick={onChooseWorker}
                className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 transition-colors p-4 cursor-pointer"
              >
                <div className="pixel-serif text-white text-lg mb-1">Earn as a worker</div>
                <div className="pixel-sans text-white/55 text-sm">Share your GPU and get paid in USDC for serving prompts.</div>
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full pixel-sans py-2 text-white/40 hover:text-white/70 text-sm transition-colors cursor-pointer"
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
