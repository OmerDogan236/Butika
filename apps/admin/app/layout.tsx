import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';

// Fontlar repoda (Google Fonts, OFL): sunucuda derleme sırasında fonts.googleapis.com'a
// ulaşılamayınca next/font/google derlemeyi düşürüyordu.
const fraunces = localFont({
  src: [
    { path: './fonts/Fraunces.ttf', style: 'normal', weight: '400 700' },
    { path: './fonts/Fraunces-Italic.ttf', style: 'italic', weight: '400 700' },
  ],
  variable: '--font-display',
  display: 'swap',
});

const inter = localFont({
  src: './fonts/Inter.ttf',
  variable: '--font-body',
  weight: '400 700',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Butika Admin',
  description: 'Butika yönetim paneli',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
