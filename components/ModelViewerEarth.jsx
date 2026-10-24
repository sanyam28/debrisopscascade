'use client';

import Script from 'next/script';

export default function ModelViewerEarth() {
  return (
    <div className="w-full h-screen bg-black">
      <Script
        type="module"
        src="https://unpkg.com/@google/model-viewer@1.10.1/dist/model-viewer.min.js"
      />
      <model-viewer
        src="/earth.glb"
        alt="NASA 3D Model of Earth"
        auto-rotate
        camera-controls
        shadow-intensity="1"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}