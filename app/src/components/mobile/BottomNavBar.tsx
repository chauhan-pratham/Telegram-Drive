import { Home, Star, Users, Folder } from 'lucide-react';

export type MobileTab = 'home' | 'starred' | 'shared' | 'files';

interface BottomNavBarProps {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
  isAndroid?: boolean;
}

export function BottomNavBar({ activeTab, setActiveTab }: BottomNavBarProps) {

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'starred', label: 'Starred', icon: Star },
    { id: 'shared', label: 'Shared', icon: Users },
    { id: 'files', label: 'Files', icon: Folder },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-telegram-bg/95 backdrop-blur-2xl border-t border-telegram-border/30 shadow-2xl flex justify-around items-center py-2 px-2 z-50 transition-all duration-300">
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => setActiveTab(id as MobileTab)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-full transition-all duration-200 cursor-pointer ${
              isActive ? 'text-telegram-primary font-bold' : 'text-telegram-subtext hover:text-telegram-text font-normal'
            }`}
          >
            <div className={`px-4 py-1.5 rounded-full transition-all flex items-center justify-center ${isActive ? 'bg-telegram-primary/25 scale-105' : ''}`}>
              <Icon className={`w-5 h-5 ${isActive && id === 'starred' ? 'fill-telegram-primary' : ''}`} />
            </div>
            <span className="text-[11px] mt-1 tracking-tight">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
