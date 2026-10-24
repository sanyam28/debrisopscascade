import './globals.css';

export const metadata = {
  title: 'Debris Ops: Cascade',
  description: 'Real-time orbital defense game built with Next.js & Three.js',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased overflow-hidden">{children}</body>
    </html>
  );
}
