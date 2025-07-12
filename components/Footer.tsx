import Link from 'next/link';
import { Heart, Github, Twitch, Link2, Globe, MessageSquare, Youtube, Coffee, Instagram } from 'lucide-react'; // Added Instagram
import DiscordIcon from './ui/DiscordIcon';
import BlueskyIcon from './ui/BlueskyIcon';

const Footer = () => {
  const links = [
    { href: 'https://github.com/CalaMariGold/Twitch-Song-Request-System', label: 'GitHub Project (open source!)', icon: Github },
    { href: 'https://www.twitch.tv/calamarigold', label: 'Twitch', icon: Twitch },
    { href: 'https://bsky.app/profile/calamari.gold', label: 'Bluesky', icon: BlueskyIcon },
    { href: 'https://calamari.gold/discord', label: 'Discord', icon: DiscordIcon },
    { href: 'https://www.instagram.com/calamarigold_ttv', label: 'Instagram', icon: Instagram },
    { href: 'https://youtube.com/c/CalaMariGold', label: 'YouTube', icon: Youtube },
    { href: 'https://www.ko-fi.com/calamarigold', label: 'Ko-fi', icon: Coffee },
  ];

  return (
    <footer className="w-full max-w-6xl mx-auto mt-12 py-6 border-t border-brand-purple-dark/30 text-center text-brand-purple-light/70 relative z-10">
      <div className="flex flex-col items-center justify-center space-y-4">
        <p className="flex items-center text-sm">
          Made with <Heart size={16} className="mx-1.5 text-brand-pink-neon fill-current" /> by 
          <Link 
            href="https://calamari.gold" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="ml-1 font-bold bg-gradient-to-r from-sky-400 via-white to-pink-300 bg-clip-text text-transparent drop-shadow-[0_1px_4px_theme('colors.brand.pink.glow/30%')] transition-all duration-300 hover:scale-110 animate-gradient-move"
            style={{ WebkitTextStroke: '0.5px #fff2', textShadow: '0 1px 4px #ff8ae280', backgroundSize: '300% 200%' }}
          >
            CalaMariGold
          </Link>
        </p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {links.map((link) => (
            <Link 
              key={link.href} 
              href={link.href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs hover:text-brand-pink-light transition-colors flex items-center gap-1"
            >
              <link.icon size={18} /> 
              {link.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-brand-purple-light/50 mt-4">
          Powered by Next.js
        </p>
      </div>
    </footer>
  );
};

export default Footer; 