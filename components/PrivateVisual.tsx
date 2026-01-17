'use client';

export default function PrivateVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg 
        width="200" 
        height="160" 
        viewBox="0 0 160 140" 
        fill="none"
        className="w-full h-full max-w-[200px]"
      >
        <defs>
          {/* Halftone pattern for shading */}
          <pattern id="halftone-private" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="white" />
          </pattern>
        </defs>
        
        {/* Input document (left side - readable) */}
        <g transform="translate(10, 35)">
          <rect x="0" y="0" width="40" height="50" fill="black" stroke="white" strokeWidth="1.5" />
          {/* Text lines */}
          <rect x="5" y="8" width="20" height="3" fill="white" opacity="0.9" />
          <rect x="5" y="15" width="30" height="3" fill="white" opacity="0.9" />
          <rect x="5" y="22" width="25" height="3" fill="white" opacity="0.9" />
          <rect x="5" y="29" width="28" height="3" fill="white" opacity="0.9" />
          <rect x="5" y="36" width="18" height="3" fill="white" opacity="0.9" />
        </g>
        
        {/* Arrow pointing right */}
        <g transform="translate(55, 55)">
          <rect x="0" y="3" width="15" height="4" fill="white" opacity="0.5" />
          <polygon points="15,0 15,10 22,5" fill="white" opacity="0.5" />
        </g>
        
        {/* Central Lock */}
        <g transform="translate(72, 30)">
          {/* Lock body with halftone */}
          <rect x="0" y="25" width="30" height="24" fill="url(#halftone-private)" stroke="white" strokeWidth="1.5" />
          <rect x="3" y="28" width="24" height="18" fill="black" />
          
          {/* Keyhole */}
          <circle cx="15" cy="35" r="4" fill="white" />
          <rect x="13" y="35" width="4" height="7" fill="white" />
          
          {/* Lock shackle */}
          <rect x="5" y="10" width="4" height="17" fill="white" />
          <rect x="21" y="10" width="4" height="17" fill="white" />
          <rect x="5" y="6" width="20" height="6" fill="white" />
          <rect x="9" y="10" width="12" height="4" fill="black" />
        </g>
        
        {/* Arrow pointing right */}
        <g transform="translate(107, 55)">
          <rect x="0" y="3" width="15" height="4" fill="white" opacity="0.5" />
          <polygon points="15,0 15,10 22,5" fill="white" opacity="0.5" />
        </g>
        
        {/* Output document (right side - encrypted/scrambled) */}
        <g transform="translate(125, 35)">
          <rect x="0" y="0" width="40" height="50" fill="url(#halftone-private)" stroke="white" strokeWidth="1.5" />
          <rect x="2" y="2" width="36" height="46" fill="black" />
          {/* Scrambled/encrypted content */}
          <rect x="5" y="8" width="8" height="3" fill="white" opacity="0.4" />
          <rect x="15" y="8" width="5" height="3" fill="white" opacity="0.4" />
          <rect x="22" y="8" width="10" height="3" fill="white" opacity="0.4" />
          <rect x="5" y="15" width="12" height="3" fill="white" opacity="0.4" />
          <rect x="20" y="15" width="7" height="3" fill="white" opacity="0.4" />
          <rect x="5" y="22" width="6" height="3" fill="white" opacity="0.4" />
          <rect x="13" y="22" width="14" height="3" fill="white" opacity="0.4" />
          <rect x="5" y="29" width="10" height="3" fill="white" opacity="0.4" />
          <rect x="17" y="29" width="8" height="3" fill="white" opacity="0.4" />
          <rect x="5" y="36" width="5" height="3" fill="white" opacity="0.4" />
          <rect x="12" y="36" width="12" height="3" fill="white" opacity="0.4" />
        </g>
        
        {/* Labels */}
        <text x="30" y="100" fill="white" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.4">PROMPT</text>
        <text x="87" y="100" fill="white" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.4">ENCRYPT</text>
        <text x="145" y="100" fill="white" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.4">SECURED</text>
      </svg>
    </div>
  );
}
