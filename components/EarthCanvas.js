// components/EarthCanvas.js
'use client';

import dynamic from 'next/dynamic';

const EarthScene = dynamic(() => import('./EarthScene'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center' }}>
      <p>Loading 3D Earth...</p>
    </div>
  ),
});

export default function EarthCanvas() {
  return <EarthScene />;
}