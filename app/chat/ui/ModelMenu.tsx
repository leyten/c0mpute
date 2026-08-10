'use client';

// The model list, lifted out of the composer so it has one implementation and
// two callers: the composer picks the model for the next prompt, an answer
// picks the model that answers it again. Same panel, same rows, same
// launching entry for the swarm tier.
import StatusBadge from '@/components/StatusBadge';
import type { ChatEngine } from '../engine/useChatEngine';
import type { Plan } from '../lib';
import { Check } from './Icons';

export default function ModelMenu({
  engine, selectedId, onPick, placement = 'up',
}: {
  engine: ChatEngine;
  /** Plan id to tick, or null when nothing in the list is current. */
  selectedId: string | null;
  onPick: (plan: Plan) => void;
  placement?: 'up' | 'down';
}) {
  return (
    <div
      className={`cu-fade absolute left-0 z-40 w-[300px] overflow-hidden rounded-2xl p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] ${placement === 'up' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]'}`}
      style={{ background: 'var(--cu-pop)' }}
    >
      {engine.models.map(m => {
        const n = engine.workerCount(m);
        const on = m.id === selectedId;
        return (
          <button
            key={m.id}
            onClick={() => onPick(m)}
            className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--chat-row-on)]"
          >
            <span className="mt-[3px] w-4 shrink-0" style={{ color: 'var(--cu-steel)' }}>{on && <Check />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--cu-text)' }}>
                {m.name}
                <span className="text-[12px]" style={{ color: 'var(--cu-faint)' }}>{m.costLabel}</span>
              </span>
              <span className="mt-0.5 block text-[12px]" style={{ color: 'var(--cu-faint)' }}>
                {n > 0 ? `${n} ${n === 1 ? 'worker' : 'workers'} online` : 'no workers right now'}
              </span>
            </span>
          </button>
        );
      })}
      <div className="mx-3 my-1 h-px" style={{ background: 'var(--cu-line)' }} />
      <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 opacity-55">
        <span className="mt-[3px] w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--cu-text)' }}>
            {engine.swarmModel.name}
            <StatusBadge state="launching" />
          </span>
          <span className="mt-0.5 block text-[12px]" style={{ color: 'var(--cu-faint)' }}>
            {engine.swarmModel.description}
          </span>
        </span>
      </div>
    </div>
  );
}
