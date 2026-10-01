"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Follows the device's light/dark setting until someone picks one with the
// top-bar switch; the choice is remembered in localStorage.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
