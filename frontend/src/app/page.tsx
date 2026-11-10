"use client";

import dynamic from "next/dynamic";

// The whole app depends on browser-only state (session token, WebSocket),
// so it renders on the client only.
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function Page() {
  return <App />;
}
