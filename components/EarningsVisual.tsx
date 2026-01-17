'use client';

export default function EarningsVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg 
        width="260" 
        height="140" 
        viewBox="0 0 260 140" 
        fill="none"
        className="w-full h-full max-w-[260px]"
      >
        <defs>
          {/* Halftone pattern for coin surfaces */}
          <pattern id="halftone-coin-surface" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.7" fill="white" />
          </pattern>
          
          {/* Halftone pattern for coin sides */}
          <pattern id="halftone-coin-side" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="white" />
          </pattern>
        </defs>
        
        {/* Coin Stack 1 - Left (3 coins) */}
        <g transform="translate(45, 65)">
          {/* Coin 1 - bottom */}
          <ellipse cx="28" cy="45" rx="28" ry="9" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <path d="M0,37 L0,45 A28,9 0 0,0 56,45 L56,37" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="37" rx="28" ry="9" fill="black" stroke="white" strokeWidth="1" />
          
          {/* Coin 2 */}
          <path d="M0,27 L0,35 A28,9 0 0,0 56,35 L56,27" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="27" rx="28" ry="9" fill="black" stroke="white" strokeWidth="1" />
          
          {/* Coin 3 - top */}
          <path d="M0,17 L0,25 A28,9 0 0,0 56,25 L56,17" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="17" rx="28" ry="9" fill="black" stroke="white" strokeWidth="1.5" />
          <text x="28" y="21" fill="white" fontSize="11" fontFamily="monospace" textAnchor="middle">$</text>
        </g>
        
        {/* Coin Stack 2 - Center (6 coins - tallest) */}
        <g transform="translate(102, 25)">
          {/* Coin 1 - bottom */}
          <ellipse cx="28" cy="85" rx="28" ry="9" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <path d="M0,77 L0,85 A28,9 0 0,0 56,85 L56,77" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="77" rx="28" ry="9" fill="url(#halftone-coin-surface)" stroke="white" strokeWidth="1" />
          
          {/* Coin 2 */}
          <path d="M0,67 L0,75 A28,9 0 0,0 56,75 L56,67" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="67" rx="28" ry="9" fill="url(#halftone-coin-surface)" stroke="white" strokeWidth="1" />
          
          {/* Coin 3 */}
          <path d="M0,57 L0,65 A28,9 0 0,0 56,65 L56,57" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="57" rx="28" ry="9" fill="url(#halftone-coin-surface)" stroke="white" strokeWidth="1" />
          
          {/* Coin 4 */}
          <path d="M0,47 L0,55 A28,9 0 0,0 56,55 L56,47" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="47" rx="28" ry="9" fill="url(#halftone-coin-surface)" stroke="white" strokeWidth="1" />
          
          {/* Coin 5 */}
          <path d="M0,37 L0,45 A28,9 0 0,0 56,45 L56,37" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="37" rx="28" ry="9" fill="black" stroke="white" strokeWidth="1" />
          
          {/* Coin 6 - top */}
          <path d="M0,27 L0,35 A28,9 0 0,0 56,35 L56,27" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="27" rx="28" ry="9" fill="black" stroke="white" strokeWidth="1.5" />
          <text x="28" y="31" fill="white" fontSize="11" fontFamily="monospace" textAnchor="middle">$</text>
        </g>
        
        {/* Coin Stack 3 - Right (4 coins) */}
        <g transform="translate(159, 55)">
          {/* Coin 1 - bottom */}
          <ellipse cx="28" cy="55" rx="28" ry="9" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <path d="M0,47 L0,55 A28,9 0 0,0 56,55 L56,47" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="47" rx="28" ry="9" fill="url(#halftone-coin-surface)" stroke="white" strokeWidth="1" />
          
          {/* Coin 2 */}
          <path d="M0,37 L0,45 A28,9 0 0,0 56,45 L56,37" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="37" rx="28" ry="9" fill="url(#halftone-coin-surface)" stroke="white" strokeWidth="1" />
          
          {/* Coin 3 */}
          <path d="M0,27 L0,35 A28,9 0 0,0 56,35 L56,27" fill="url(#halftone-coin-side)" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="27" rx="28" ry="9" fill="black" stroke="white" strokeWidth="1" />
          
          {/* Coin 4 - top */}
          <path d="M0,17 L0,25 A28,9 0 0,0 56,25 L56,17" fill="white" fillOpacity="0.12" stroke="white" strokeWidth="1" />
          <ellipse cx="28" cy="17" rx="28" ry="9" fill="black" stroke="white" strokeWidth="1.5" />
          <text x="28" y="21" fill="white" fontSize="11" fontFamily="monospace" textAnchor="middle">$</text>
        </g>
      </svg>
    </div>
  );
}
