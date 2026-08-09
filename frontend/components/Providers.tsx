"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { activeChain } from "@/lib/network";

const queryClient = new QueryClient();

// Injected wallets only — RainbowKit's modal styling fights the game's
// full-bleed black, and the title screen does its own asking.
const config = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: { [activeChain.id]: http() },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
