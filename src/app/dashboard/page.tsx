'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Package, 
  Layers, 
  AlertTriangle, 
  Coins, 
  TrendingUp, 
  History,
  ArrowRight,
  TrendingDown,
  Percent,
  CalendarDays,
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import { showToast } from '@/components/ui/toast';

interface DashboardStats {
  totalProducts: number;
  totalStock: number;
  lowStockCount: number;
  totalCategories: number;
  todaySales: number;
  totalSalesValue: number;
  monthlySalesCount: number;
  monthlySalesValue: number;
}

interface ActivityLog {
  id: string;
  action: string;
  details: string;
  created_at: string;
}

interface ProductInfo {
  id: string;
  sku: string;
  name: string;
  current_stock: number;
  minimum_stock_alert: number;
  selling_price: number;
  categories?: any;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalStock: 0,
    lowStockCount: 0,
    totalCategories: 0,
    todaySales: 0,
    totalSalesValue: 0,
    monthlySalesCount: 0,
    monthlySalesValue: 0
  });
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      // 1. Fetch products count, stock sums, and low stock list
      const { data: products, error: prodErr } = await supabase
        .from('products')
        .select('id, name, sku, current_stock, minimum_stock_alert, selling_price, categories(name)');
      if (prodErr) throw prodErr;

      // 2. Fetch categories count
      const { count: catCount, error: catErr } = await supabase
        .from('categories')
        .select('*', { count: 'exact', head: true });
      if (catErr) throw catErr;

      // 3. Fetch today's sales (up to 11:59 PM today)
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 0, 0);

      const { data: sales, error: salesErr } = await supabase
        .from('sales')
        .select('total_amount')
        .gte('sale_date', startOfDay.toISOString())
        .lt('sale_date', endOfDay.toISOString());
      if (salesErr) throw salesErr;

      // Fetch this month's sales (up to 11:59 PM of the last day)
      const startOfMonth = new Date(now);
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const endOfMonth = new Date(lastDayOfMonth);
      endOfMonth.setHours(23, 59, 0, 0);

      const { data: monthSales, error: monthSalesErr } = await supabase
        .from('sales')
        .select('total_amount')
        .gte('sale_date', startOfMonth.toISOString())
        .lt('sale_date', endOfMonth.toISOString());
      if (monthSalesErr) throw monthSalesErr;

      // 4. Fetch recent activity logs
      const { data: logs, error: logsErr } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(6);
      if (logsErr) throw logsErr;

      // Calculations
      let totalStock = 0;
      let lowStockCount = 0;
      const lowStockList: ProductInfo[] = [];

      products?.forEach((p) => {
        totalStock += Number(p.current_stock || 0);
        const cat = p.categories as any;
        const catName = cat ? (Array.isArray(cat) ? cat[0]?.name : cat.name) : '';
        const nameClean = (catName || '').toLowerCase().trim();
        const isFootwear = nameClean === 'mens footwear' || nameClean === 'women footwear' || nameClean === 'winter boot' || nameClean === 'winter boots';

        if (isFootwear && p.current_stock < 7) {
          lowStockCount++;
          if (lowStockList.length < 5) {
            lowStockList.push(p);
          }
        }
      });

      let todaySalesCount = sales?.length || 0;
      let todaySalesVal = sales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;

      let monthlySalesCount = monthSales?.length || 0;
      let monthlySalesVal = monthSales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;

      // Reset logic at 11:59 PM
      if (now.getHours() === 23 && now.getMinutes() === 59) {
        todaySalesCount = 0;
        todaySalesVal = 0;

        // Check if last day of the month
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        if (tomorrow.getMonth() !== now.getMonth()) {
          monthlySalesCount = 0;
          monthlySalesVal = 0;
        }
      }

      setStats({
        totalProducts: products?.length || 0,
        totalStock,
        lowStockCount,
        totalCategories: catCount || 0,
        todaySales: todaySalesCount,
        totalSalesValue: todaySalesVal,
        monthlySalesCount: monthlySalesCount,
        monthlySalesValue: monthlySalesVal
      });

      setLowStockProducts(lowStockList);
      setActivities(logs || []);
    } catch (err) {
      console.error('Error fetching dashboard statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this activity log entry?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('activity_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      showToast('Activity log entry successfully deleted.', 'success');
      fetchDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete activity log', 'error');
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Set up Realtime Sync
    const channelProducts = supabase
      .channel('realtime-dashboard-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => fetchDashboardData())
      .subscribe();

    return () => {
      supabase.removeChannel(channelProducts);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        {/* Header skeleton */}
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
        {/* Card skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          ))}
        </div>
        {/* Detail skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  // Activity action tags helper
  const getActionBadge = (action: string) => {
    const map: Record<string, string> = {
      PRODUCT_ADDED: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
      PRODUCT_EDITED: 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20',
      PRODUCT_DELETED: 'bg-red-500/10 text-red-500 border border-red-500/20',
      STOCK_ADDED: 'bg-teal-500/10 text-teal-500 border border-teal-500/20',
      STOCK_REMOVED: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
      PURCHASE_CREATED: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
      SALE_CREATED: 'bg-fuchsia-500/10 text-fuchsia-500 border border-fuchsia-500/20',
    };
    return map[action] || 'bg-slate-500/10 text-slate-500 border border-slate-500/20';
  };

  const statCards = [
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: Package,
      gradient: 'from-blue-500 to-indigo-600',
      description: 'Items in catalog',
      link: '/dashboard/products'
    },
    {
      title: 'Total Stock',
      value: stats.totalStock,
      icon: Layers,
      gradient: 'from-emerald-500 to-teal-600',
      description: 'Physical inventory units',
      link: '/dashboard/stock'
    },
    {
      title: 'Low Stock Products',
      value: stats.lowStockCount,
      icon: AlertTriangle,
      gradient: 'from-rose-500 to-red-600',
      description: 'At or below alert levels',
      link: '/dashboard/products?filter=lowStock',
      alert: stats.lowStockCount > 0
    },
    {
      title: "Today's Revenue",
      value: `₹${stats.totalSalesValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      icon: Coins,
      gradient: 'from-amber-500 to-orange-600',
      description: `${stats.todaySales} sales logged today`,
      link: '/dashboard/sales'
    },
    {
      title: "Monthly Revenue",
      value: `₹${stats.monthlySalesValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      gradient: 'from-fuchsia-500 to-purple-600',
      description: `${stats.monthlySalesCount} sales logged this month`,
      link: '/dashboard/sales'
    }
  ];

  return (
    <div className="flex flex-col gap-8 select-none">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time operations monitor for KY Footwear & Apparel
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-2xl shadow-sm self-start">
          <CalendarDays className="w-4.5 h-4.5 text-indigo-500" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <Link
              key={index}
              href={card.link}
              className={`relative overflow-hidden group p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] ${
                card.alert ? 'ring-2 ring-red-500/20' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                    {card.title}
                  </span>
                  <h3 className="text-2xl font-extrabold tracking-tight">{card.value}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{card.description}</p>
                </div>
                <div className={`flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr ${card.gradient} text-white shadow-md group-hover:scale-105 transition-transform duration-200`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
              {/* Subtle accent bar */}
              <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient}`} />
            </Link>
          );
        })}
      </div>

      {/* Main Content Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Panel */}
        <div className="lg:col-span-2 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-850">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="font-extrabold text-base tracking-tight">Critical Stock Alerts</h2>
            </div>
            <Link 
              href="/dashboard/products?filter=lowStock"
              className="text-xs font-bold text-indigo-500 hover:text-indigo-400 flex items-center gap-1 transition-all"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex-1 overflow-x-auto">
            {lowStockProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-3 border border-emerald-500/20">
                  <Package className="w-6 h-6" />
                </div>
                <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300">All Stock Normal</h4>
                <p className="text-xs text-slate-500 max-w-xs mt-1">No products are currently under their minimum threshold alert level.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/40 text-[10px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-100 dark:border-slate-850">
                    <th className="p-4">Product Name</th>
                    <th className="p-4">SKU</th>
                    <th className="p-4 text-center">Current Stock</th>
                    <th className="p-4 text-center">Min Alert</th>
                    <th className="p-4 text-right">Selling Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {lowStockProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/30 transition-colors">
                      <td className="p-4 font-semibold text-xs truncate max-w-[200px]">{p.name}</td>
                      <td className="p-4 text-xs font-mono text-slate-500 dark:text-slate-400">{p.sku}</td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                          {p.current_stock}
                        </span>
                      </td>
                      <td className="p-4 text-center text-xs text-slate-500 font-medium">{p.minimum_stock_alert}</td>
                      <td className="p-4 text-right font-mono text-xs font-semibold">₹{p.selling_price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Activity Logs Panel */}
        <div className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-850">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              <h2 className="font-extrabold text-base tracking-tight">Recent Activity</h2>
            </div>
          </div>

          <div className="flex-1 p-5 overflow-y-auto max-h-[340px] space-y-4">
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
                <History className="w-8 h-8 text-slate-500 animate-pulse mb-2" />
                <p className="text-xs text-slate-500">No activity logs recorded yet.</p>
              </div>
            ) : (
              activities.map((act) => (
                <div key={act.id} className="flex gap-3 text-xs leading-relaxed group">
                  <div className="flex flex-col items-center">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                      act.action === 'PRODUCT_ADDED' || act.action === 'STOCK_ADDED' ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 
                      act.action === 'PRODUCT_DELETED' || act.action === 'STOCK_REMOVED' ? 'bg-rose-500 shadow-[0_0_6px_#f43f5e]' : 
                      'bg-indigo-500 shadow-[0_0_6px_#6366f1]'
                    }`} />
                    <div className="w-[1px] flex-1 bg-slate-200 dark:bg-slate-800 group-last:hidden mt-1" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-center gap-2">
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md uppercase tracking-wider ${getActionBadge(act.action)}`}>
                        {act.action.replace('_', ' ')}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          {new Date(act.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => handleDeleteActivity(act.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-0.5 rounded transition-all active:scale-95 cursor-pointer"
                          title="Delete Activity Log"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 font-medium text-[11px] leading-relaxed pr-1">
                      {act.details}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
