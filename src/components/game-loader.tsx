"use client";

import dynamic from "next/dynamic";

const DendroHunter = dynamic(() => import("@/components/dendro-hunter"), {
  ssr: false,
  loading: () => (
    <div className="loading-overlay">
      <div className="spinner" />
      <p>正在從本機載入樹木資料...</p>
    </div>
  ),
});

export function GameLoader() {
  return <DendroHunter />;
}
