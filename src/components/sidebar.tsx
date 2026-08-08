'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { 
  LayoutDashboard, 
  Package, 
  ArrowUpRight, 
  ArrowDownRight, 
  BadgeDollarSign, 
  BarChart3, 
  LogOut, 
  X,
  User,
  Truck,
  Layers,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Zap,
  Key
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

interface SubMenuItem {
  name: string;
  href: string;
  badge?: string;
  icon: any;
}

interface MenuGroup {
  groupName: string;
  icon: any;
  items: SubMenuItem[];
}

export default function Sidebar({ isOpen, onClose, isMobile = false }: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  // Accordion open states for groups
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'Sales & Dispatches': true,
    'Inventory & Stock Master': true,
    'Warehouse & Transfers': true,
    'Reports & Analytics': true
  });

  const toggleGroup = (name: string) => {
    setOpenGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const menuGroups: MenuGroup[] = [
    {
      groupName: 'Sales & Dispatches',
      icon: BadgeDollarSign,
      items: [
        { name: 'Today Sold Out (Excel)', href: '/dashboard/today-sold-out', badge: 'Excel', icon: ArrowDownRight },
        { name: 'All Sales Register', href: '/dashboard/sales', icon: BadgeDollarSign }
      ]
    },
    {
      groupName: 'Inventory & Stock Master',
      icon: Package,
      items: [
        { name: 'Inventory', href: '/dashboard/products', icon: Package },
        { name: 'Stock Manager & Matrix', href: '/dashboard/stock', icon: Layers },
        { name: 'Replenishment Reorder', href: '/dashboard/replenishment', icon: ArrowUpRight }
      ]
    },
    {
      groupName: 'Warehouse & Transfers',
      icon: Truck,
      items: [
        { name: 'Send to Warehouse', href: '/dashboard/send-warehouse', icon: Truck }
      ]
    },
    {
      groupName: 'Reports & Analytics',
      icon: BarChart3,
      items: [
        { name: 'Sales & Stock Reports', href: '/dashboard/reports', icon: BarChart3 }
      ]
    },
    {
      groupName: 'Admin Portal',
      icon: ShieldCheck,
      items: [
        { name: 'Active Login Sessions', href: '/dashboard/admin-sessions', icon: ShieldCheck }
      ]
    }
  ];

  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out?')) {
      await signOut();
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 border-r border-slate-800 select-none">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/40">
        <Link href="/dashboard" className="flex items-center gap-3" onClick={onClose}>
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 shadow-[0_4px_15px_rgba(99,102,241,0.25)] border border-white/10 flex-shrink-0">
            <span className="font-black text-sm text-white tracking-tighter">KY</span>
          </div>
          <div className="flex flex-col">
            <span className="font-black text-base tracking-wider bg-gradient-to-r from-white via-indigo-100 to-cyan-400 bg-clip-text text-transparent leading-tight">
              KY Inventory
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 fill-indigo-400" />
              Logic ERP Mode
            </span>
          </div>
        </Link>
        {isMobile && onClose && (
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Main Dashboard Link */}
      <div className="px-3 pt-3 pb-1">
        <Link
          href="/dashboard"
          onClick={onClose}
          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all duration-200 ${
            pathname === '/dashboard'
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 text-indigo-400" />
          <span>Dashboard Overview</span>
        </Link>
      </div>

      {/* Accordion Menu Groups */}
      <nav className="flex-1 px-3 py-2 space-y-3 overflow-y-auto custom-scrollbar">
        {menuGroups.map((group) => {
          const GroupIcon = group.icon;
          const isExpanded = openGroups[group.groupName] ?? true;
          const hasActiveItem = group.items.some(item => pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href)));

          return (
            <div key={group.groupName} className="space-y-1">
              {/* Group Header Button */}
              <button
                type="button"
                onClick={() => toggleGroup(group.groupName)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all ${
                  hasActiveItem
                    ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center gap-2">
                  <GroupIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{group.groupName}</span>
                </div>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {/* Sub-menu items */}
              {isExpanded && (
                <div className="pl-2 space-y-1 border-l border-slate-800 ml-3.5">
                  {group.items.map((item) => {
                    const cleanItemPath = item.href.split('?')[0];
                    const isActive = cleanItemPath === '/dashboard' 
                      ? pathname === '/dashboard' 
                      : pathname === cleanItemPath;
                    const ItemIcon = item.icon;

                    return (
                      <Link
                        key={`${group.groupName}-${item.name}`}
                        href={item.href}
                        prefetch={true}
                        onClick={onClose}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all group ${
                          isActive
                            ? 'bg-indigo-600 text-white font-bold shadow-sm'
                            : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <ItemIcon className={`w-4 h-4 transition-transform ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'}`} />
                          <span>{item.name}</span>
                        </div>

                        {item.badge && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${isActive ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Admin Profile Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 space-y-2">
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-indigo-400">
            <User className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-200 truncate">
              {user?.email || 'Administrator'}
            </p>
            <p className="text-[9px] text-emerald-400 font-extrabold tracking-widest uppercase flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              ERP Authorized
            </p>
          </div>
        </div>
        
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-800 hover:border-red-500/30 hover:bg-red-500/10 text-slate-400 hover:text-red-400 font-bold text-xs tracking-wider uppercase transition-all active:scale-95 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
        <div className={`absolute top-0 bottom-0 left-0 w-72 max-w-[85vw] transform transition-transform duration-300 ease-out shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {sidebarContent}
        </div>
      </div>
    );
  }

  return (
    <aside className="hidden md:flex flex-col w-64 h-full shrink-0">
      {sidebarContent}
    </aside>
  );
}
