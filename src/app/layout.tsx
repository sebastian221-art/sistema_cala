import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CALA ASOCIADOS — Sistema de Gestión Contable',
  description:
    'Sistema de gestión contable de CALA ASOCIADOS. Gestiona obligaciones tributarias, estados financieros y recordatorios automáticos. San Gil, Santander — Colombia.',
  keywords: ['contabilidad', 'tributario', 'DIAN', 'Colombia', 'IVA', 'renta', 'estados financieros', 'CALA ASOCIADOS'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
