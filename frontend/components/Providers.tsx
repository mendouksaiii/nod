"use client";

import { ReactNode, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { ThemeProvider, useTheme } from "next-themes";
import { activeChain } from "@/lib/network";

const queryClient = new QueryClient();

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

const config = projectId
  ? getDefaultConfig({
      appName: "inco confidential lottery",
      projectId,
      chains: [activeChain],
      ssr: true,
    })
  : createConfig({
      chains: [activeChain],
      transports: {
        [activeChain.id]: http(),
      },
      ssr: true,
    });

// Inner provider that uses theme context
const RainbowKitWithTheme = ({ children }: { children: ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rainbowTheme =
    mounted && resolvedTheme === "light"
      ? lightTheme({ accentColor: "#262626", accentColorForeground: "#fafafa", borderRadius: "none" })
      : darkTheme({ accentColor: "#d4d4d4", accentColorForeground: "#0a0a0a", borderRadius: "none" });

  return (
    <RainbowKitProvider theme={rainbowTheme}>{children}</RainbowKitProvider>
  );
};

const Providers = ({ children }: { children: ReactNode }) => {
  if (!projectId) {
    console.warn(
      "Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. Get one at https://cloud.walletconnect.com/"
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitWithTheme>{children}</RainbowKitWithTheme>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
};

export { Providers };
