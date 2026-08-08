'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';
import Modal from '@/components/ui/modal';
import { write, utils } from 'xlsx';
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  History, 
  Download, 
  Search,
  Eye,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  TrendingUp
} from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  purchase_price: number;
}

interface PurchaseItemInput {
  product_id: string;
  quantity: number;
  cost_price: number;
}

interface Purchase {
  id: string;
  supplier_name: string;
  invoice_number: string;
  purchase_date: string;
  total_amount: number;
  created_at: string;
}

interface PurchaseItemDetail {
  id: string;
  product_id: string;
  quantity: number;
  cost_price: number;
  products?: {
    name: string;
    sku: string;
  };
}

export default function PurchasesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // New Purchase Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemInput[]>([
    { product_id: '', quantity: 1, cost_price: 0 }
  ]);

  // Details modal state
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activePurchase, setActivePurchase] = useState<Purchase | null>(null);
  const [activeDetails, setActiveDetails] = useState<PurchaseItemDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Search and Pagination for Purchases History
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch products for dropdown
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('id, sku, name, purchase_price')
        .order('name', { ascending: true });
      if (prodErr) throw prodErr;
      setProducts(prodData || []);

      // Fetch purchase entries
      const { data: purchData, error: purchErr } = await supabase
        .from('purchases')
        .select('*')
        .order('purchase_date', { ascending: false });
      if (purchErr) throw purchErr;
      setPurchases(purchData || []);
    } catch (err: any) {
      showToast(err.message || 'Error loading purchases', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Enable realtime sync
    const channel = supabase
      .channel('purchases-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => {
        silentReload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const silentReload = async () => {
    const { data: purchData } = await supabase.from('purchases').select('*').order('purchase_date', { ascending: false });
    if (purchData) setPurchases(purchData);
  };

  // Dynamically update product cost when selected in dynamic form items list
  const handleProductSelect = (index: number, productId: string) => {
    const p = products.find(prod => prod.id === productId);
    const updated = [...purchaseItems];
    updated[index] = {
      ...updated[index],
      product_id: productId,
      cost_price: p ? p.purchase_price : 0
    };
    setPurchaseItems(updated);
  };

  const handleItemChange = (index: number, field: keyof PurchaseItemInput, value: any) => {
    const updated = [...purchaseItems];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setPurchaseItems(updated);
  };

  const addFormItem = () => {
    setPurchaseItems(prev => [...prev, { product_id: '', quantity: 1, cost_price: 0 }]);
  };

  const removeFormItem = (index: number) => {
    if (purchaseItems.length === 1) return;
    setPurchaseItems(prev => prev.filter((_, i) => i !== index));
  };

  // View purchase items details in Modal
  const viewDetails = async (purchase: Purchase) => {
    setActivePurchase(purchase);
    setIsDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_items')
        .select('*, products(name, sku)')
        .eq('purchase_id', purchase.id);
      if (error) throw error;
      setActiveDetails(data || []);
    } catch (err: any) {
      showToast(err.message || 'Error loading details', 'error');
    } finally {
      setDetailsLoading(false);
    }
  };

  const openNewPurchaseForm = () => {
    setSupplierName('');
    setInvoiceNumber('');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseItems([{ product_id: products[0]?.id || '', quantity: 1, cost_price: products[0]?.purchase_price || 0 }]);
    setIsFormOpen(true);
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName || !invoiceNumber) {
      showToast('Supplier Name and Invoice Number are required', 'warning');
      return;
    }

    // Validate items
    const invalidItem = purchaseItems.find(item => !item.product_id || item.quantity <= 0 || item.cost_price < 0);
    if (invalidItem) {
      showToast('All fields must be filled and quantity must be greater than 0', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      // Calculate total amount
      const totalAmount = purchaseItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.cost_price || 0)), 0);

      // 1. Insert Purchase
      const { data: purchaseData, error: purchErr } = await supabase
        .from('purchases')
        .insert({
          supplier_name: supplierName,
          invoice_number: invoiceNumber,
          purchase_date: purchaseDate,
          total_amount: totalAmount
        })
        .select()
        .single();
      if (purchErr) throw purchErr;

      // 2. Insert Purchase Items (Triggers will automatically increment product stocks, add stock movements, and log activities!)
      const itemsPayload = purchaseItems.map(item => ({
        purchase_id: purchaseData.id,
        product_id: item.product_id,
        quantity: item.quantity,
        cost_price: item.cost_price
      }));

      const { error: itemsErr } = await supabase
        .from('purchase_items')
        .insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      // 3. Log main activity
      await supabase.from('activity_logs').insert({
        action: 'PURCHASE_CREATED',
        details: `Purchase Order created for supplier "${supplierName}" (Invoice: ${invoiceNumber}) for total value ₹${totalAmount.toFixed(2)}.`
      });

      showToast('Purchase Order logged successfully!', 'success');
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Error logging purchase order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Export to Excel
  const handleExportHistory = () => {
    const wsData = purchases.map((p) => ({
      'Invoice Number': p.invoice_number,
      'Supplier Name': p.supplier_name,
      'Purchase Date': p.purchase_date,
      'Total Amount (₹)': p.total_amount,
      'Logged Date': new Date(p.created_at).toLocaleDateString()
    }));

    const ws = utils.json_to_sheet(wsData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'KY Purchases');
    
    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `KY_Purchases_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    showToast('Purchase history exported!', 'success');
  };

  // Filtering & Pagination
  const filteredPurchases = purchases.filter(p => 
    p.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredPurchases.length / itemsPerPage);
  const paginatedPurchases = filteredPurchases.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="flex flex-col gap-6 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Purchases Log</h1>
          <p className="text-sm text-slate-500 mt-1">Log restock shipments, update purchase costs, and track incoming invoice transactions.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={handleExportHistory}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 active:scale-[0.98] font-semibold text-xs tracking-wider uppercase transition-all"
          >
            <Download className="w-4 h-4" />
            Export History
          </button>
          <button
            onClick={openNewPurchaseForm}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98] text-white font-semibold text-xs tracking-wider uppercase shadow-md transition-all"
          >
            <Plus className="w-4.5 h-4.5" />
            New Purchase
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
          placeholder="Search by supplier or invoice..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Purchases History list container */}
      <div className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-500 font-semibold animate-pulse">Loading purchases list...</div>
        ) : paginatedPurchases.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">No purchases found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/40 text-[10px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-100 dark:border-slate-850">
                  <th className="p-4">Purchase Date</th>
                  <th className="p-4">Invoice Number</th>
                  <th className="p-4">Supplier Name</th>
                  <th className="p-4 text-right">Invoice total</th>
                  <th className="p-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {paginatedPurchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-all">
                    <td className="p-4 text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{new Date(p.purchase_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>
                    </td>
                    <td className="p-4 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{p.invoice_number}</td>
                    <td className="p-4 text-xs font-semibold text-slate-600 dark:text-slate-400">{p.supplier_name}</td>
                    <td className="p-4 text-right font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">₹{p.total_amount.toFixed(2)}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => viewDetails(p)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-all active:scale-95"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-xs text-slate-550">Page {currentPage} of {totalPages}</span>
            <div className="flex gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 1. New Purchase Entry Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Log New Purchase Order Invoice"
      >
        <form onSubmit={handlePurchaseSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Supplier Name */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 block">Supplier Name *</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Leather Craft Corp"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>

            {/* Invoice Number */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 block">Invoice Number *</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="INV-2026-001"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>

            {/* Purchase Date */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 block">Purchase Date *</label>
              <input
                type="date"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
          </div>

          {/* Dynamic Purchase items listing */}
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Purchase Items List</span>
              <button
                type="button"
                onClick={addFormItem}
                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-indigo-500 rounded-lg text-xs font-bold transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {purchaseItems.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row items-end gap-3 p-3.5 rounded-xl border border-slate-100 dark:border-slate-850 bg-slate-50/40 dark:bg-slate-950/20">
                  {/* Select Product */}
                  <div className="flex-1 space-y-1 w-full">
                    <label className="text-[10px] font-semibold text-slate-400">Select Product *</label>
                    <select
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-xs focus:ring-indigo-500 cursor-pointer"
                      value={item.product_id}
                      onChange={(e) => handleProductSelect(idx, e.target.value)}
                    >
                      <option value="" disabled className="dark:bg-slate-900">Choose Product...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id} className="dark:bg-slate-900">[{p.sku}] {p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="w-full sm:w-20 space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400">Qty *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-xs"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>

                  {/* Cost price */}
                  <div className="w-full sm:w-28 space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400">Unit Cost (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-xs"
                      value={item.cost_price || ''}
                      onChange={(e) => handleItemChange(idx, 'cost_price', Number(e.target.value))}
                    />
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    disabled={purchaseItems.length === 1}
                    onClick={() => removeFormItem(idx)}
                    className="p-2 border border-slate-200 dark:border-slate-800 hover:border-red-500/30 hover:bg-red-500/10 text-slate-400 hover:text-red-500 rounded-lg transition-all disabled:opacity-40"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-500">
              Total Order Cost: <span className="text-indigo-600 dark:text-indigo-400 font-mono text-sm ml-1">
                ₹{purchaseItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.cost_price || 0)), 0).toFixed(2)}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 min-w-[120px] flex justify-center"
              >
                {submitting ? 'Submitting...' : 'Log Purchase'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 2. Purchase Details Modal */}
      <Modal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title={`Purchase Details: Invoice ${activePurchase?.invoice_number}`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500">
            <span>Supplier: <strong className="text-slate-850 dark:text-slate-200">{activePurchase?.supplier_name}</strong></span>
            <span className="text-right">Purchase Date: <strong>{activePurchase && new Date(activePurchase.purchase_date).toLocaleDateString()}</strong></span>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {detailsLoading ? (
              <div className="py-10 text-center animate-pulse text-slate-500 font-semibold">Loading items details...</div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/40 font-bold uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="p-3">SKU</th>
                    <th className="p-3">Product Name</th>
                    <th className="p-3 text-center">Quantity</th>
                    <th className="p-3 text-right">Unit Cost</th>
                    <th className="p-3 text-right">Total Sub</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {activeDetails.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors">
                      <td className="p-3 font-mono font-semibold text-indigo-500">{item.products?.sku}</td>
                      <td className="p-3 font-medium">{item.products?.name}</td>
                      <td className="p-3 text-center font-bold">{item.quantity}</td>
                      <td className="p-3 text-right font-mono">₹{item.cost_price.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-semibold">₹{(item.quantity * item.cost_price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800 font-bold">
            <span className="text-xs text-slate-400">Logged At: {activePurchase && new Date(activePurchase.created_at).toLocaleString()}</span>
            <span className="text-sm">Total: <strong className="font-mono text-indigo-600 dark:text-indigo-400 ml-1">₹{activePurchase?.total_amount.toFixed(2)}</strong></span>
          </div>

          <div className="flex justify-end pt-3">
            <button
              onClick={() => setIsDetailsOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-250 dark:bg-slate-850 dark:hover:bg-slate-800 rounded-lg uppercase tracking-wider transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
