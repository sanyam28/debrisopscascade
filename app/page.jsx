'use client';

import dynamic from 'next/dynamic';

const OrbitalScene = dynamic(
  () => import('../components/canvas/OrbitalScene'),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="relative w-full h-screen">
      <OrbitalScene />
    </main>
  );
}