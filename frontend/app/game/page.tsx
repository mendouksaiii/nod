import type { Metadata } from "next";
import GameCanvas from "@/components/GameCanvas";

export const metadata: Metadata = {
  title: "NOD",
};

export default function GamePage() {
  return <GameCanvas />;
}
