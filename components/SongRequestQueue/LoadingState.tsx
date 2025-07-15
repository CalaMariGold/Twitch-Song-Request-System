import { Loader2 } from "lucide-react";
import React from "react";

export function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 animate-spin text-brand-pink-neon" />
    </div>
  );
} 