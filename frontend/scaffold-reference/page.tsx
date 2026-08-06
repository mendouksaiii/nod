import { ConfLottery } from "@/components/ConfLottery";

const Home = () => {
  return (
    <main className="min-h-[calc(100vh-65px)] flex flex-col">
      <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <h1 className="text-xl md:text-2xl font-medium text-foreground mb-2">
            confidential lottery
          </h1>
          <p className="text-sm text-muted-foreground">
            privacy-preserving lottery with encrypted deposits using Inco
          </p>
        </div>
        <ConfLottery />
      </div>

      <footer className="border-t border-border py-6">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>built with next.js + wagmi + inco</span>
          <a
            href="https://docs.inco.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            inco docs →
          </a>
        </div>
      </footer>
    </main>
  );
};

export default Home;
