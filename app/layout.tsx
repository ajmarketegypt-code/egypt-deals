import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SwRegister } from '@/components/SwRegister'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Egypt Deals',
  description: 'All-time low prices on Amazon.eg and Noon.eg',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Deals' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${inter.className} bg-slate-900 text-slate-100 min-h-screen`}>
        <SwRegister />
        {children}
      </body>
    </html>
  )
}
