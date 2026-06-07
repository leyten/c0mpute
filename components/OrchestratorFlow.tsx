'use client';

import { motion } from 'framer-motion';

// Clean SVG icons with pixelated aesthetic
const UserIcon = ({ className = '' }: { className?: string }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className}>
    <rect x="7" y="2" width="6" height="6" fill="currentColor" />
    <rect x="4" y="10" width="12" height="8" fill="currentColor" />
  </svg>
);

const PCIcon = ({ className = '' }: { className?: string }) => (
  <svg width="24" height="22" viewBox="0 0 24 22" fill="none" className={className}>
    {/* Monitor */}
    <rect x="2" y="0" width="20" height="14" fill="currentColor" />
    <rect x="4" y="2" width="16" height="10" fill="black" />
    {/* Screen content - little dots */}
    <rect x="6" y="4" width="2" height="2" fill="currentColor" />
    <rect x="10" y="4" width="4" height="2" fill="currentColor" />
    <rect x="6" y="7" width="8" height="2" fill="currentColor" />
    {/* Stand */}
    <rect x="10" y="14" width="4" height="2" fill="currentColor" />
    <rect x="6" y="16" width="12" height="2" fill="currentColor" />
  </svg>
);

const QueueIcon = ({ className = '' }: { className?: string }) => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className={className}>
    {/* Outer frame */}
    <rect x="4" y="4" width="24" height="24" fill="currentColor" />
    <rect x="6" y="6" width="20" height="20" fill="black" />
    {/* Queue bars inside */}
    <rect x="8" y="9" width="16" height="3" fill="currentColor" />
    <rect x="8" y="14" width="12" height="3" fill="currentColor" />
    <rect x="8" y="19" width="8" height="3" fill="currentColor" />
    {/* Corner accents */}
    <rect x="2" y="2" width="4" height="4" fill="currentColor" />
    <rect x="26" y="2" width="4" height="4" fill="currentColor" />
    <rect x="2" y="26" width="4" height="4" fill="currentColor" />
    <rect x="26" y="26" width="4" height="4" fill="currentColor" />
  </svg>
);

// Single complete flow animation
const SingleFlow = ({ 
  user,
  worker,
  centerX,
  centerY,
  totalDuration,
  startDelay = 0,
}: { 
  user: { x: number; y: number };
  worker: { x: number; y: number };
  centerX: number;
  centerY: number;
  totalDuration: number;
  startDelay?: number;
}) => {
  // Timing: each segment is 1s, with small gaps
  // 0-1s: User to Queue
  // 1.2-2.2s: Queue to Worker  
  // 2.8-3.8s: Worker to Queue
  // 4-5s: Queue to User
  // Total active: ~5s, then wait for next cycle
  
  return (
    <>
      {/* Step 1: User → Queue */}
      <motion.div
        className="absolute w-2 h-2 bg-white"
        style={{ left: -4, top: -4 }}
        animate={{ 
          x: [user.x + 10, centerX],
          y: [user.y, centerY],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 1,
          times: [0, 0.1, 0.9, 1],
          delay: startDelay,
          repeat: Infinity,
          repeatDelay: totalDuration - 1,
          ease: "linear",
        }}
      />
      
      {/* Step 2: Queue → Worker */}
      <motion.div
        className="absolute w-2 h-2 bg-white"
        style={{ left: -4, top: -4 }}
        animate={{ 
          x: [centerX, worker.x - 12],
          y: [centerY, worker.y],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 1,
          times: [0, 0.1, 0.9, 1],
          delay: startDelay + 1.2,
          repeat: Infinity,
          repeatDelay: totalDuration - 1,
          ease: "linear",
        }}
      />
      
      {/* Step 3: Worker → Queue */}
      <motion.div
        className="absolute w-2 h-2 bg-white"
        style={{ left: -4, top: -4 }}
        animate={{ 
          x: [worker.x - 12, centerX],
          y: [worker.y, centerY],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 1,
          times: [0, 0.1, 0.9, 1],
          delay: startDelay + 2.8,
          repeat: Infinity,
          repeatDelay: totalDuration - 1,
          ease: "linear",
        }}
      />
      
      {/* Step 4: Queue → User */}
      <motion.div
        className="absolute w-2 h-2 bg-white"
        style={{ left: -4, top: -4 }}
        animate={{ 
          x: [centerX, user.x + 10],
          y: [centerY, user.y],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 1,
          times: [0, 0.1, 0.9, 1],
          delay: startDelay + 4,
          repeat: Infinity,
          repeatDelay: totalDuration - 1,
          ease: "linear",
        }}
      />
      
      {/* User highlight */}
      <motion.div
        className="absolute w-6 h-6 border border-white/50"
        style={{ left: user.x - 13, top: user.y - 13 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{
          duration: 5.5,
          times: [0, 0.05, 0.95, 1],
          delay: startDelay,
          repeat: Infinity,
          repeatDelay: totalDuration - 5.5,
        }}
      />
      
      {/* Worker highlight */}
      <motion.div
        className="absolute w-7 h-7 border border-white/50"
        style={{ left: worker.x - 15, top: worker.y - 14 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{
          duration: 2.5,
          times: [0, 0.1, 0.9, 1],
          delay: startDelay + 1.5,
          repeat: Infinity,
          repeatDelay: totalDuration - 2.5,
        }}
      />
    </>
  );
};

export default function OrchestratorFlow() {
  const centerX = 160;
  const centerY = 80;
  
  const users = [
    { x: 20, y: 40 },
    { x: 20, y: 80 },
    { x: 20, y: 120 },
  ];
  
  const workers = [
    { x: 300, y: 40 },
    { x: 300, y: 80 },
    { x: 300, y: 120 },
  ];

  // 3 flows cycling through different user/worker combinations
  // Each flow takes 6s, total cycle 18s
  const singleFlowDuration = 6;
  const totalCycleDuration = 18;

  // Different user → worker combinations
  const flows = [
    { user: users[1], worker: workers[0], delay: 0 },              // Middle user → Top worker
    { user: users[0], worker: workers[2], delay: singleFlowDuration },      // Top user → Bottom worker
    { user: users[2], worker: workers[1], delay: singleFlowDuration * 2 },  // Bottom user → Middle worker
  ];

  return (
    <div className="relative w-full h-full min-h-[180px]">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full max-w-[340px] h-[160px]">
          
          {/* Connection lines - Users to Center */}
          {users.map((user, i) => (
            <svg key={`line-u-${i}`} className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
              <line 
                x1={user.x + 10} 
                y1={user.y} 
                x2={centerX} 
                y2={centerY} 
                stroke="rgba(255,255,255,0.1)" 
                strokeWidth="1"
              />
            </svg>
          ))}
          
          {/* Connection lines - Center to Workers */}
          {workers.map((worker, i) => (
            <svg key={`line-w-${i}`} className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
              <line 
                x1={centerX} 
                y1={centerY} 
                x2={worker.x - 10} 
                y2={worker.y} 
                stroke="rgba(255,255,255,0.1)" 
                strokeWidth="1"
              />
            </svg>
          ))}

          {/* Three flows cycling through different combinations */}
          {flows.map((flow, i) => (
            <SingleFlow
              key={i}
              user={flow.user}
              worker={flow.worker}
              centerX={centerX}
              centerY={centerY}
              totalDuration={totalCycleDuration}
              startDelay={flow.delay}
            />
          ))}

          {/* User nodes */}
          {users.map((user, i) => (
            <div
              key={`user-${i}`}
              className="absolute text-white"
              style={{ left: user.x - 10, top: user.y - 10 }}
            >
              <UserIcon />
            </div>
          ))}

          {/* Central orchestrator/queue */}
          <motion.div
            className="absolute text-white"
            style={{ left: centerX - 16, top: centerY - 16 }}
            animate={{ 
              scale: [1, 1.03, 1],
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <QueueIcon />
          </motion.div>

          {/* Worker nodes (PCs) */}
          {workers.map((worker, i) => (
            <div
              key={`worker-${i}`}
              className="absolute text-white"
              style={{ left: worker.x - 12, top: worker.y - 11 }}
            >
              <PCIcon />
            </div>
          ))}

          {/* Labels */}
          <span className="absolute pixel-sans text-white/60 text-[10px] tracking-wider" style={{ left: 8, top: 145 }}>
            USERS
          </span>
          <span className="absolute pixel-sans text-white/60 text-[10px] tracking-wider" style={{ left: centerX - 12, top: 145 }}>
            QUEUE
          </span>
          <span className="absolute pixel-sans text-white/60 text-[10px] tracking-wider" style={{ left: 280, top: 145 }}>
            WORKERS
          </span>
        </div>
      </div>
    </div>
  );
}
