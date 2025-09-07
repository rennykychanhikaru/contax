export const metadata = {
  title: 'Contax Demo',
  description: 'Local demo for voice agent scheduling'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui', margin: 0 }}>{children}</body>
    </html>
  )
}

