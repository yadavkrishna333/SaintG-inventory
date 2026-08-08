'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';
import { write, utils } from 'xlsx';
import { 
  ArrowUpDown, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search, 
  Calendar,
  History,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Sliders
} from 'lucide-react';

interface StockMovement {
  id: string;
  product_id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  reason: string;
  created_at: string;
  products?: {
    name: string;
    sku: string;
    color: string;
    size: string;
    categories?: {
      name: string;
    } | null;
  } | null;
}

export default function StockManagerPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch stock movements with joined product info
      const { data, error } = await supabase
        .from('stock_movements')
        .select(`
          id,
          product_id,
          type,
          quantity,
          reason,
          created_at,
          products (
            name,
            sku,
            color,
            size,
            categories (
              name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMovements(data as any[] || []);
    } catch (err: any) {
      showToast(err.message || 'Error loading stock logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Enable realtime subscriptions to keep stock pages instantly sync'd
    const channelMovements = supabase
      .channel('stock-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => {
        silentReload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelMovements);
    };
  }, []);

  const silentReload = async () => {
    const { data } = await supabase
      .from('stock_movements')
      .select(`
        id,
        product_id,
        type,
        quantity,
        reason,
        created_at,
        products (
          name,
          sku,
          color,
          size,
          categories (
            name
          )
        )
      `)
      .order('created_at', { ascending: false });
    if (data) setMovements(data as any[]);
  };

  // Helper to extract size from movement reason, fallback to product display size
  const extractSizeFromReason = (reason: string, productSize?: string): string => {
    if (!reason) return productSize || 'One Size';
    const match = reason.match(/(?:size:?\s*|size\s+)([a-z0-9]+)/i);
    if (match) {
      return match[1].toUpperCase();
    }
    return productSize || 'One Size';
  };

  // Get unique categories list from movements
  const getUniqueCategories = () => {
    const cats = new Set<string>();
    movements.forEach(m => {
      const cat = m.products?.categories as any;
      const catName = cat ? (Array.isArray(cat) ? cat[0]?.name : cat.name) : '';
      if (catName) cats.add(catName);
    });
    return Array.from(cats).sort();
  };

  // Filtering Logic
  const filteredMovements = movements.filter((move) => {
    // 1. Search Query
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query ||
      (move.products?.sku || '').toLowerCase().includes(query) ||
      (move.products?.name || '').toLowerCase().includes(query) ||
      (move.products?.color || '').toLowerCase().includes(query) ||
      (move.reason || '').toLowerCase().includes(query);
    if (!matchesSearch) return false;

    // 2. Category Filter
    if (selectedCategory !== 'all') {
      const cat = move.products?.categories as any;
      const catName = cat ? (Array.isArray(cat) ? cat[0]?.name : cat.name) : '';
      if (catName !== selectedCategory) return false;
    }

    // 3. Type Filter
    if (selectedType !== 'all') {
      if (move.type !== selectedType) return false;
    }

    // 4. Date Filter
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const moveDate = new Date(move.created_at);
      if (moveDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const moveDate = new Date(move.created_at);
      if (moveDate > end) return false;
    }

    return true;
  });

  // Totals calculations
  const totalAddedQty = filteredMovements
    .filter(m => m.type === 'IN')
    .reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);

  const totalRemovedQty = filteredMovements
    .filter(m => m.type === 'OUT')
    .reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);

  const totalAdjustmentQty = filteredMovements
    .filter(m => m.type === 'ADJUSTMENT')
    .reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);

  // Pagination elements (preserved for typing compatibility but not used in grouped view)
  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const paginatedMovements = filteredMovements.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Grouping helpers for date-wise display
  const getLocalIsoKey = (dateInput: string | Date) => {
    const d = new Date(dateInput);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const localTodayKey = getLocalIsoKey(new Date());

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const localTomorrowKey = getLocalIsoKey(tomorrowDate);

  const getGroupHeading = (isoDateKey: string) => {
    if (isoDateKey === localTodayKey) return "Today";
    if (isoDateKey === localTomorrowKey) return "Tomorrow";
    
    const [y, m, d] = isoDateKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Group movements dynamically
  const groupedMovements: Record<string, StockMovement[]> = {};
  filteredMovements.forEach(m => {
    const key = getLocalIsoKey(m.created_at);
    if (!groupedMovements[key]) groupedMovements[key] = [];
    groupedMovements[key].push(m);
  });

  // Sort date keys: Today first, then Tomorrow under it, then other dates descending
  const sortedDateKeys = Object.keys(groupedMovements).sort((a, b) => {
    if (a === localTodayKey) return -1;
    if (b === localTodayKey) return 1;
    if (a === localTomorrowKey) return -1;
    if (b === localTomorrowKey) return 1;
    return b.localeCompare(a);
  });

  const regularDateKeys = sortedDateKeys.slice(0, 3);
  const scrollableDateKeys = sortedDateKeys.slice(3);

  const renderMovementsTable = (dayMovements: StockMovement[]) => {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950/40 text-[9px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-100 dark:border-slate-800">
              <th className="py-2.5 px-4 w-28">Time</th>
              <th className="py-2.5 px-4 w-28">SKU Code</th>
              <th className="py-2.5 px-4 w-44">Product Name</th>
              <th className="py-2.5 px-4 w-28">Category</th>
              <th className="py-2.5 px-4 w-24">Color</th>
              <th className="py-2.5 px-4 text-center w-16">Size</th>
              <th className="py-2.5 px-4 text-center w-20">Type</th>
              <th className="py-2.5 px-4 text-center w-16">Qty</th>
              <th className="py-2.5 px-4">Reason / Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
            {dayMovements.map((move) => {
              const cat = move.products?.categories as any;
              const catName = cat ? (Array.isArray(cat) ? cat[0]?.name : cat.name) : 'Uncategorized';
              const sizeVal = extractSizeFromReason(move.reason, move.products?.size);
              return (
                <tr key={move.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 font-semibold">
                    {new Date(move.created_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="py-2.5 px-4 font-mono font-bold text-indigo-650 dark:text-indigo-400 truncate max-w-[100px]" title={move.products?.sku || ''}>
                    {move.products?.sku || 'N/A'}
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]" title={move.products?.name || ''}>
                    {move.products?.name || <span className="text-slate-400 italic">Unnamed Product</span>}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 font-medium">{catName}</td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 font-medium capitalize">{move.products?.color || 'N/A'}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className="inline-block px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-extrabold rounded">
                      {sizeVal}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      move.type === 'IN' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 
                      move.type === 'OUT' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                      'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
                    }`}>
                      {move.type === 'IN' ? 'Added' : move.type === 'OUT' ? 'Removed' : 'Adjust'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`font-extrabold text-[12px] ${
                      move.type === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 
                      move.type === 'OUT' ? 'text-rose-500' : 'text-indigo-600 dark:text-indigo-400'
                    }`}>
                      {move.type === 'IN' ? `+${move.quantity}` : move.type === 'OUT' ? `-${move.quantity}` : `${move.quantity}`}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 font-medium max-w-[200px] truncate" title={move.reason}>{move.reason || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const handleExportStockHistory = () => {
    if (filteredMovements.length === 0) {
      showToast('No history entries to export', 'warning');
      return;
    }

    const wsData = filteredMovements.map((move) => {
      const cat = move.products?.categories as any;
      const catName = cat ? (Array.isArray(cat) ? cat[0]?.name : cat.name) : 'Uncategorized';
      const sizeVal = extractSizeFromReason(move.reason, move.products?.size);
      return {
        'Date': new Date(move.created_at).toLocaleDateString('en-IN'),
        'Time': new Date(move.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        'SKU Code': move.products?.sku || 'N/A',
        'Product Name': move.products?.name || 'N/A',
        'Category': catName,
        'Color': move.products?.color || 'N/A',
        'Size': sizeVal,
        'Type': move.type === 'IN' ? 'Stock Added' : move.type === 'OUT' ? 'Stock Removed' : 'Adjustment',
        'Quantity': move.quantity,
        'Reason': move.reason || 'N/A'
      };
    });

    const ws = utils.json_to_sheet(wsData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Stock History');
    
    // Auto-fit column widths
    const maxColWidths = Object.keys(wsData[0] || {}).map((_, colIndex) => {
      return Math.max(...wsData.map(row => {
        const val = Object.values(row)[colIndex];
        return val ? String(val).length : 0;
      })) + 4;
    });
    ws['!cols'] = maxColWidths.map(w => ({ wch: w }));

    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `KY_Stock_History_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    showToast('Stock History Excel exported successfully!', 'success');
  };

  return (
    <div className="flex flex-col gap-6 select-none font-sans">
      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Stock History Log</h1>
          <p className="text-sm text-slate-500 mt-1">Audit log of all manual and automatic inventory stock additions, checkouts, and adjustments.</p>
        </div>
        <button
          onClick={handleExportStockHistory}
          disabled={filteredMovements.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-bold text-xs tracking-wider uppercase transition-all shadow-md cursor-pointer disabled:opacity-50"
        >
          <Download className="w-4.5 h-4.5" />
          Export Stock History
        </button>
      </div>

      {/* Stats Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Stock Added (IN)</span>
            <h3 className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">+{totalAddedQty} units</h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Stock Removed (OUT)</span>
            <h3 className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">-{totalRemovedQty} units</h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Adjustments</span>
            <h3 className="text-2xl font-extrabold text-indigo-500">{totalAdjustmentQty} operations</h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
            <Sliders className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col gap-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Search & Filters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {/* Search box */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 text-slate-700 dark:text-slate-200"
              placeholder="Search SKU, name, color..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Categories</option>
            {getUniqueCategories().map(cat => (
              <option key={cat} value={cat} className="dark:bg-slate-900">{cat}</option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Types (IN & OUT)</option>
            <option value="IN">Stock Added (IN)</option>
            <option value="OUT">Stock Removed (OUT)</option>
            <option value="ADJUSTMENT">Adjustments</option>
          </select>

          {/* Start Date */}
          <div className="relative flex items-center">
            <span className="absolute left-3 text-slate-400 z-10">
              <Calendar className="w-3.5 h-3.5" />
            </span>
            <input
              type="date"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              title="Start Date"
            />
          </div>

          {/* End Date */}
          <div className="relative flex items-center">
            <span className="absolute left-3 text-slate-400 z-10">
              <Calendar className="w-3.5 h-3.5" />
            </span>
            <input
              type="date"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              title="End Date"
            />
          </div>
        </div>

        {(searchQuery || startDate || endDate || selectedCategory !== 'all' || selectedType !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setStartDate('');
              setEndDate('');
              setSelectedCategory('all');
              setSelectedType('all');
              setCurrentPage(1);
            }}
            className="text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 rounded-xl self-start transition-all cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Main Stock History Container */}
      <div className="space-y-6">
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center gap-3 border rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-550" />
            <span className="text-sm text-slate-500 font-semibold animate-pulse">Loading stock movement logs...</span>
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center gap-3 border rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <History className="w-8 h-8 text-slate-400 animate-pulse" />
            <h3 className="font-bold text-slate-700 dark:text-slate-300 text-sm">No History Records Found</h3>
            <p className="text-xs text-slate-500">Try adjusting your filters or search keywords above.</p>
          </div>
        ) : (
          <>
            {/* Regular (First 3 Days) */}
            {regularDateKeys.map(dateKey => {
              const dayMovements = groupedMovements[dateKey];
              const heading = getGroupHeading(dateKey);
              return (
                <div key={dateKey} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <span className="w-2.5 h-4.5 rounded bg-indigo-500" />
                    <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">{heading}</h2>
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {dayMovements.length} Entries
                    </span>
                  </div>
                  
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    {renderMovementsTable(dayMovements)}
                  </div>
                </div>
              );
            })}

            {/* Scrollable (Older History) */}
            {scrollableDateKeys.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="w-2.5 h-4.5 rounded bg-slate-400" />
                  <h2 className="text-sm font-black text-slate-650 dark:text-slate-400 uppercase tracking-wider">Older History Log</h2>
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {scrollableDateKeys.reduce((sum, k) => sum + groupedMovements[k].length, 0)} Entries
                  </span>
                </div>
                
                <div className="max-h-[500px] overflow-y-auto pr-2 space-y-5 border border-dashed border-slate-250 dark:border-slate-800 p-4 rounded-2xl bg-slate-50/20 dark:bg-slate-950/20 shadow-inner">
                  {scrollableDateKeys.map(dateKey => {
                    const dayMovements = groupedMovements[dateKey];
                    const heading = getGroupHeading(dateKey);
                    return (
                      <div key={dateKey} className="space-y-2 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                          <span className="w-1.5 h-3 rounded bg-slate-350 dark:bg-slate-650" />
                          <h3 className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{heading}</h3>
                          <span className="text-[9px] text-slate-450 font-bold">({dayMovements.length} records)</span>
                        </div>
                        {renderMovementsTable(dayMovements)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
