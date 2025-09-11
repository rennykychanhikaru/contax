import { Providers } from '../components/providers';
import './globals.css';

export const metadata = {
  title: 'Contax Demo',
  description: 'Local demo for voice agent scheduling'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
