'use client';

export default function BrowserVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg 
        width="200" 
        height="150" 
        viewBox="0 0 160 120" 
        fill="none"
        className="w-full h-full max-w-[200px]"
      >
        <defs>
          {/* Halftone pattern for progress bar */}
          <pattern id="halftone-browser" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.9" fill="white" />
          </pattern>
        </defs>
        
        {/* Main browser window */}
        <g transform="translate(10, 10)">
          {/* Window frame */}
          <rect x="0" y="0" width="140" height="95" fill="white" stroke="white" strokeWidth="2" />
          
          {/* Title bar */}
          <rect x="0" y="0" width="140" height="16" fill="white" />
          
          {/* Title bar dots */}
          <rect x="5" y="5" width="6" height="6" fill="black" />
          <rect x="14" y="5" width="6" height="6" fill="black" />
          <rect x="23" y="5" width="6" height="6" fill="black" />
          
          {/* URL bar */}
          <rect x="35" y="4" width="100" height="8" fill="black" />
          <rect x="37" y="5" width="55" height="6" fill="white" opacity="0.3" />
          
          {/* Content area */}
          <rect x="2" y="18" width="136" height="75" fill="black" />
          
          {/* Terminal content */}
          {/* Line 1 */}
          <text x="8" y="32" fill="white" fontSize="9" fontFamily="monospace" opacity="0.5">&gt;</text>
          <rect x="18" y="25" width="50" height="6" fill="white" opacity="0.35" />
          
          {/* Line 2 */}
          <text x="8" y="46" fill="white" fontSize="9" fontFamily="monospace" opacity="0.5">&gt;</text>
          <rect x="18" y="39" width="75" height="6" fill="white" opacity="0.35" />
          
          {/* Line 3 - output */}
          <rect x="18" y="52" width="45" height="6" fill="white" opacity="0.2" />
          
          {/* Line 4 - active prompt with cursor */}
          <text x="8" y="72" fill="white" fontSize="9" fontFamily="monospace" opacity="0.5">&gt;</text>
          <rect x="18" y="65" width="8" height="8" fill="white" />
          
          {/* Progress bar */}
          <rect x="8" y="80" width="120" height="6" fill="white" opacity="0.1" stroke="white" strokeWidth="0.5" />
          <rect x="9" y="81" width="80" height="4" fill="url(#halftone-browser)" />
        </g>
      </svg>
    </div>
  );
}
