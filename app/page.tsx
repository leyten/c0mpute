'use client';

import { useEffect, useRef } from 'react';
import PixelBlast from '@/components/PixelBlast';

export default function Home() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      console.log('Container dimensions:', rect.width, rect.height);
    }
  }, []);
  
  return (
    <div 
      ref={wrapperRef}
      style={{ 
        position: 'fixed', 
        inset: 0,
        width: '100vw', 
        height: '100vh', 
        zIndex: -1,
        margin: 0,
        padding: 0,
        display: 'block'
      }}
    >
      <PixelBlast
        variant="circle"
        pixelSize={5}
        className=""
        color="#fafafa"
        patternScale={2}
        patternDensity={0.8}
        enableRipples={false}
        rippleSpeed={0.3}
        rippleThickness={0.1}
        rippleIntensityScale={1.1}
        speed={0.1}
        transparent
        edgeFade={0.05}
        style={{ width: '100%', height: '100%', display: 'block', position: 'absolute', inset: 0 }}
      />
    </div>
  );
}
