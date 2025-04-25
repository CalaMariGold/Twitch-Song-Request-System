import Link from 'next/link';
import { Heart, Github, Twitch, Link2, Globe, MessageSquare, Youtube, Coffee } from 'lucide-react'; // Example icons

const Footer = () => {
  const links = [
    { href: 'https://github.com/CalaMariGold/Twitch-Song-Request-System', label: 'GitHub Project (open source!)', icon: Github },
    { href: 'https://www.twitch.tv/calamarigold', label: 'Twitch', icon: Twitch },
    { href: 'https://calamari.gold', label: 'My Website', icon: Globe },
    { href: 'https://bsky.app/profile/calamari.gold', label: 'Bluesky', icon: MessageSquare }, // Using MessageSquare as placeholder
    { href: 'https://calamari.gold/discord', label: 'Discord', icon: MessageSquare }, // Using MessageSquare as placeholder
    { href: 'https://youtube.com/c/CalaMariGold', label: 'YouTube', icon: Youtube },
    { href: 'https://www.ko-fi.com/calamarigold', label: 'Ko-fi', icon: Coffee },
  ];

  return (
    <footer className="w-full max-w-6xl mx-auto mt-12 py-6 border-t border-brand-purple-dark/30 text-center text-brand-purple-light/70 relative z-10">
      <div className="flex flex-col items-center justify-center space-y-4">
        <p className="flex items-center text-sm">
          Made with <Heart size={16} className="mx-1.5 text-brand-pink-neon fill-current" /> by CalaMariGold
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
              <link.icon size={14} /> 
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