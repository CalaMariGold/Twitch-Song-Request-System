import { Card, CardContent } from "./ui/card";
import Image from "next/image";
import React from "react";

const PosterCard: React.FC = () => (
  <Card className="bg-gradient-to-br from-brand-pink-light/80 to-brand-pink-dark/80 border-brand-pink-neon/40 backdrop-blur-md shadow-glow-pink-md hover:shadow-glow-pink-lg transition-all duration-300 ease-in-out hover:scale-[1.01]">
    <a href="https://calamarigold-shop.fourthwall.com/products/shinyfest-2025-concert-poster" target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
      <CardContent className="p-1 flex flex-col items-center text-center">
        <div className="relative w-full aspect-[5/7] mb-0 border-2 border-brand-pink-neon/30 rounded-md overflow-hidden shadow-inner shadow-brand-black/30">
          <Image 
            src="/shinyfest 2025 poster.png" 
            alt="ShinyFest 2025 Poster" 
            fill
            sizes="(max-width: 768px) 100vw, 384px"
            className="object-cover"
            priority
            quality={100}
          />
        </div>
        <p className="text-[11px] font-semibold text-white leading-snug pt-1 [text-shadow:1px_1px_3px_black]">
          ShinyFest 2025 poster now available for sale!
        </p>
      </CardContent>
    </a>
  </Card>
);

export default PosterCard; 