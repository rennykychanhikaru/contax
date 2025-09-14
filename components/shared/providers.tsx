'use client';

import { ThemeProvider } from 'next-themes';

type ProvidersProps = {
  children: React.ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      enableSystem
      disableTransitionOnChange
      defaultTheme="dark"
      enableColorScheme={false}
    >
      {children}
    </ThemeProvider>
  );
}