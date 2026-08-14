"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { activeChain } from "@/lib/network";

const queryClient = new QueryClient();

// Injected wallets only — RainbowKit's modal styling fights the game's
// full-bleed black, and the title screen does its own asking.
//
// Exported so the title screen can fetch a wallet client imperatively AFTER
// switching chains. useWalletClient() returns undefined whenever the wallet's
// active chain is not in this config — i.e. any wallet sitting on Ethereum
// mainnet, which is most of them — and that is the "connected but never
// answered" hang: the hook waits for a client that the current chain can never
// produce.
export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: { [activeChain.id]: http() },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
