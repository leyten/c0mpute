---
sidebar_position: 2
title: Why c0mpute matters
---

# Why c0mpute matters

AI is centralizing fast. A handful of companies — OpenAI, Google, Anthropic — control who gets access to AI, what those models will say, and what they refuse to answer. Every prompt you send is logged, analyzed, and often used to train the next model.

This is a problem.

## Censorship

Corporate AI models are trained to refuse entire categories of questions. Ask about certain topics and you get a polished non-answer: *"I can't help with that."* These aren't safety measures — they're editorial decisions made by companies about what you should and shouldn't think about.

The refusal list grows with every update. Topics that worked last month get blocked this month. You have no say in it.

## Privacy

When you use ChatGPT, Claude, or Gemini, your prompts travel to their servers, get logged, and are potentially reviewed by employees or used for training. You're handing your thoughts to a corporation and hoping they treat them well.

c0mpute is different, and the privacy comes from two things working together:

- **We never store your prompts.** Jobs are processed in memory and discarded the moment they finish — there's no conversation database. Only token counts are kept, for billing.
- **Workers never see who you are.** A worker receives the prompt text and nothing else: no name, no wallet, no account, no way to know who they're answering. The orchestrator routes the job but strips your identity from it.

So your prompts aren't kept, and the person whose GPU runs them has no idea it's you. (Note: this is ephemeral + anonymous, not end-to-end encrypted — the orchestrator sees prompt text in transit to route it. We don't claim otherwise.)

## Single points of failure

When OpenAI goes down, millions of people lose access to AI. When they change their terms of service, you comply or leave. When they raise prices, you pay or go without.

A decentralized network has no single point of failure. Workers join and leave freely. The network adapts. No one entity can shut it down or change the rules unilaterally.

## The c0mpute model

- **Workers** are regular people sharing their GPU power. They earn USDC for every job completed.
- **Users** get private, uncensored AI without accounts being tracked or prompts being logged.
- **The network** is censorship-resistant by design — there's no central authority to pressure into blocking content.

This isn't theoretical. c0mpute is running now. [Start using it](/user-guide/getting-started) or [become a worker](/worker-guide/browser-worker).
