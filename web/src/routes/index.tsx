import { createFileRoute } from "@tanstack/react-router";
import { IncantApp } from "@/components/incant/IncantApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <IncantApp />;
}
