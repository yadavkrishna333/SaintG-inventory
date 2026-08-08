'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import Link from 'next/link';
import Sidebar from '@/components/sidebar';
import ThemeToggle from '@/components/theme-toggle';
import { 
  Menu, 
  Sparkles, 
  AlertTriangle, 
  ChevronDown, 
  BadgeDollarSign, 
  Package, 
  Truck, 
  BarChart3, 
  ArrowDownRight, 
  Layers, 
  ArrowUpRight,
  Zap,
  ShieldCheck,
  Key
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [activeNavDropdown, setActiveNavDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const handleClickOutside = () => setActiveNavDropdown(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Fetch low stock count dynamically for a small navbar alert indicator
  useEffect(() => {
    if (!user) return;
    
    const fetchLowStockCount = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, current_stock, categories(name)');
        if (error) throw error;
        
        if (data) {
          const low = data.filter(p => {
            const cat = p.categories as any;
            const catName = cat ? (Array.isArray(cat) ? cat[0]?.name : cat.name) : '';
            const nameClean = (catName || '').toLowerCase().trim();
            const isFootwear = nameClean === 'mens footwear' || nameClean === 'women footwear' || nameClean === 'winter boot' || nameClean === 'winter boots';
            return isFootwear && p.current_stock < 7;
          }).length;
          setLowStockCount(low);
        }
      } catch (err) {
        console.error('Error fetching low stock for layout:', err);
      }
    };

    fetchLowStockCount();

    // Subscribe to product stock changes for real-time alerts update
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          fetchLowStockCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-950 text-slate-100 min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
          </div>
          <div className="text-sm font-semibold tracking-wider text-slate-400">Authenticating session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Desktop Sidebar */}
      <Sidebar isOpen={false} isMobile={false} />

      {/* Mobile Drawer Sidebar */}
      <Sidebar 
        isOpen={mobileSidebarOpen} 
        onClose={() => setMobileSidebarOpen(false)} 
        isMobile={true} 
      />

      {/* Main Body */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header Bar */}
        <header className="flex items-center justify-between h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 text-slate-600 dark:text-slate-300"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden md:flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm font-medium">
              <span className="font-extrabold text-slate-800 dark:text-slate-100">KY Inventory</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-wider text-xs flex items-center gap-1 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                <Zap className="w-3 h-3" /> LOGIC ERP ENTERPRISE
              </span>
            </div>
            <div className="md:hidden flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 flex items-center justify-center border border-white/10 shadow-sm">
                <span className="font-black text-xs text-white tracking-tighter">KY</span>
              </div>
              <span className="font-black text-sm tracking-wider">KY ERP</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Low stock badge link */}
            {lowStockCount > 0 && (
              <div 
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-500 animate-pulse cursor-pointer hover:bg-amber-500/15"
                onClick={() => router.push('/dashboard/products?filter=lowStock')}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{lowStockCount} Low Stock</span>
              </div>
            )}
            <ThemeToggle />
          </div>
        </header>

        {/* ERP Top Ribbon Sub-Navbar Dropdown Bar */}
        <nav className="hidden md:flex items-center gap-1.5 bg-slate-900 border-b border-slate-800 px-6 py-2 text-xs font-bold select-none text-slate-300 z-10 shrink-0 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 mr-2 border-r border-slate-800 pr-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            LOGIC ERP NAV
          </div>

          {/* Sales & Dispatches Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setActiveNavDropdown('sales')}
            onMouseLeave={() => setActiveNavDropdown(null)}
          >
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setActiveNavDropdown(prev => prev === 'sales' ? null : 'sales');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeNavDropdown === 'sales' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <BadgeDollarSign className="w-4 h-4 text-emerald-400" />
              <span>Sales & Dispatches</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${activeNavDropdown === 'sales' ? 'rotate-180 text-white' : ''}`} />
            </button>

            {activeNavDropdown === 'sales' && (
              <div className="absolute top-full left-0 pt-1 w-64 z-50 animate-in fade-in slide-in-from-top-1">
                <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5">
                  <Link 
                    href="/dashboard/today-sold-out" 
                    onClick={() => setActiveNavDropdown(null)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-indigo-600 hover:text-white text-slate-300 text-xs transition-colors"
                  >
                    <ArrowDownRight className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="font-bold">Today Sold Out</div>
                      <div className="text-[10px] text-slate-400 font-normal">Excel Upload & Fast Sales</div>
                    </div>
                  </Link>
                  <Link 
                    href="/dashboard/sales" 
                    onClick={() => setActiveNavDropdown(null)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-indigo-600 hover:text-white text-slate-300 text-xs transition-colors"
                  >
                    <BadgeDollarSign className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-bold">All Sales Register</div>
                      <div className="text-[10px] text-slate-400 font-normal">Detailed Transaction History</div>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Inventory & Stock Master Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setActiveNavDropdown('inventory')}
            onMouseLeave={() => setActiveNavDropdown(null)}
          >
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setActiveNavDropdown(prev => prev === 'inventory' ? null : 'inventory');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeNavDropdown === 'inventory' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Package className="w-4 h-4 text-indigo-400" />
              <span>Inventory & Stock</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${activeNavDropdown === 'inventory' ? 'rotate-180 text-white' : ''}`} />
            </button>

            {activeNavDropdown === 'inventory' && (
              <div className="absolute top-full left-0 pt-1 w-64 z-50 animate-in fade-in slide-in-from-top-1">
                <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5">
                  <Link 
                    href="/dashboard/products" 
                    prefetch={true}
                    onClick={() => setActiveNavDropdown(null)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-indigo-600 hover:text-white text-slate-300 text-xs transition-colors"
                  >
                    <Package className="w-4 h-4 text-indigo-400" />
                    <div>
                      <div className="font-bold">Inventory</div>
                      <div className="text-[10px] text-slate-400 font-normal">Products & Master SKUs</div>
                    </div>
                  </Link>
                  <Link 
                    href="/dashboard/stock" 
                    prefetch={true}
                    onClick={() => setActiveNavDropdown(null)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-indigo-600 hover:text-white text-slate-300 text-xs transition-colors"
                  >
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="font-bold">Stock Manager</div>
                      <div className="text-[10px] text-slate-400 font-normal">Size Matrix & Stock Levels</div>
                    </div>
                  </Link>
                  <Link 
                    href="/dashboard/replenishment" 
                    prefetch={true}
                    onClick={() => setActiveNavDropdown(null)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-indigo-600 hover:text-white text-slate-300 text-xs transition-colors"
                  >
                    <ArrowUpRight className="w-4 h-4 text-rose-400" />
                    <div>
                      <div className="font-bold">Replenishment</div>
                      <div className="text-[10px] text-slate-400 font-normal">Reorder Low Stock Items</div>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Warehouse Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setActiveNavDropdown('warehouse')}
            onMouseLeave={() => setActiveNavDropdown(null)}
          >
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setActiveNavDropdown(prev => prev === 'warehouse' ? null : 'warehouse');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeNavDropdown === 'warehouse' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Truck className="w-4 h-4 text-amber-400" />
              <span>Warehouse</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${activeNavDropdown === 'warehouse' ? 'rotate-180 text-white' : ''}`} />
            </button>

            {activeNavDropdown === 'warehouse' && (
              <div className="absolute top-full left-0 pt-1 w-60 z-50 animate-in fade-in slide-in-from-top-1">
                <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5">
                  <Link 
                    href="/dashboard/send-warehouse" 
                    prefetch={true}
                    onClick={() => setActiveNavDropdown(null)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-indigo-600 hover:text-white text-slate-300 text-xs transition-colors"
                  >
                    <Truck className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="font-bold">Send to Warehouse</div>
                      <div className="text-[10px] text-slate-400 font-normal">Bulk Stock Dispatch</div>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Reports Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setActiveNavDropdown('reports')}
            onMouseLeave={() => setActiveNavDropdown(null)}
          >
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setActiveNavDropdown(prev => prev === 'reports' ? null : 'reports');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeNavDropdown === 'reports' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span>Reports</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${activeNavDropdown === 'reports' ? 'rotate-180 text-white' : ''}`} />
            </button>

            {activeNavDropdown === 'reports' && (
              <div className="absolute top-full left-0 pt-1 w-60 z-50 animate-in fade-in slide-in-from-top-1">
                <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5">
                  <Link 
                    href="/dashboard/reports" 
                    prefetch={true}
                    onClick={() => setActiveNavDropdown(null)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-indigo-600 hover:text-white text-slate-300 text-xs transition-colors"
                  >
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="font-bold">Audit & Executive Reports</div>
                      <div className="text-[10px] text-slate-400 font-normal">Sales Analytics & Logs</div>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Admin Portal Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setActiveNavDropdown('admin')}
            onMouseLeave={() => setActiveNavDropdown(null)}
          >
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setActiveNavDropdown(prev => prev === 'admin' ? null : 'admin');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeNavDropdown === 'admin' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Admin Portal</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${activeNavDropdown === 'admin' ? 'rotate-180 text-white' : ''}`} />
            </button>

            {activeNavDropdown === 'admin' && (
              <div className="absolute top-full left-0 pt-1 w-64 z-50 animate-in fade-in slide-in-from-top-1">
                <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5">
                  <Link 
                    href="/dashboard/admin-sessions" 
                    prefetch={true}
                    onClick={() => setActiveNavDropdown(null)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-indigo-600 hover:text-white text-slate-300 text-xs transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="font-bold">Active Login Sessions</div>
                      <div className="text-[10px] text-slate-400 font-normal">Devices, IP Geolocation & Revoke</div>
                    </div>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Route Page Container */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
