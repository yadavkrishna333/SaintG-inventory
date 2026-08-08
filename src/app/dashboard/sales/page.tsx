'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';
import Modal from '@/components/ui/modal';
import { write, utils } from 'xlsx';
import { 
  BadgeDollarSign, 
  Plus, 
  Trash2, 
  Download, 
  Search,
  Eye,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Barcode as BarcodeIcon,
  ShoppingCart,
  Edit3,
  TrendingUp,
  BarChart3
} from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  color?: string;
  selling_price: number;
  current_stock: number;
  barcode: string;
  category_id?: string;
  size_stocks?: Record<string, number>;
  categories?: any;
}

interface SaleItemInput {
  product_id: string;
  size: string;
  quantity: number;
  selling_price: number;
}

interface Sale {
  id: string;
  sale_date: string;
  total_amount: number;
  created_at: string;
}

interface SaleItemRow {
  id: string;
  sale_id: string;
  product_id: string;
  size: string;
  quantity: number;
  selling_price: number;
  created_at: string;
  sales: {
    sale_date: string;
  } | null;
  products: {
    sku: string;
    name: string;
    color: string;
    category_id?: string;
    categories?: any;
  } | null;
}

interface SaleItemDetail {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  selling_price: number;
  products?: {
    name: string;
    sku: string;
  };
}

const SIZE_PRESETS: Record<string, string[]> = {
  'Mens Footwear': ['40', '41', '42', '43', '44', '45'],
  'Women Footwear': ['35', '36', '37', '38', '39', '40', '41'],
  'Winter Boot': ['35', '36', '37', '38', '39', '40', '41'],
  'Mens Jacket': ['S', 'M', 'L', 'XL', 'XXL'],
  'Apparels': ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  'Shades': ['One Size'],
  'Bags': ['One Size'],
  'Gift Bag': ['One Size']
};

const getCategorySizesByName = (catName: string): string[] => {
  if (!catName) return ['One Size'];
  
  if (SIZE_PRESETS[catName]) {
    return SIZE_PRESETS[catName];
  }
  
  const name = catName.toLowerCase().trim();
  if (name.includes('footwear') || name.includes('shoe') || name.includes('boot') || name.includes('heel') || name.includes('sandal') || name.includes('loafer')) {
    if (name.includes('men')) {
      return ['40', '41', '42', '43', '44', '45'];
    }
    return ['35', '36', '37', '38', '39', '40', '41'];
  }
  
  if (name.includes('jacket') || name.includes('coat') || name.includes('blazer') || name.includes('outerwear')) {
    return ['S', 'M', 'L', 'XL', 'XXL'];
  }
  
  if (name.includes('apparel') || name.includes('clothing') || name.includes('shirt') || name.includes('pant') || name.includes('t-shirt') || name.includes('wear')) {
    return ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  }
  
  return ['One Size'];
};

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [saleItemsRows, setSaleItemsRows] = useState<SaleItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'history' | 'analytics'>('history');

  // New Sale Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saleItems, setSaleItems] = useState<SaleItemInput[]>([
    { product_id: '', size: 'One Size', quantity: 1, selling_price: 0 }
  ]);

  // Barcode quick-add search input
  const [barcodeSearchInput, setBarcodeSearchInput] = useState('');

  // Details modal state
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activeSale, setActiveSale] = useState<Sale | null>(null);
  const [activeDetails, setActiveDetails] = useState<SaleItemDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Edit Price state variables
  const [isPriceEditOpen, setIsPriceEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SaleItemRow | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [updatingPrice, setUpdatingPrice] = useState(false);

  // Edit Date state variables
  const [isDateEditOpen, setIsDateEditOpen] = useState(false);
  const [editingRowForDate, setEditingRowForDate] = useState<SaleItemRow | null>(null);
  const [newDate, setNewDate] = useState('');
  const [updatingDate, setUpdatingDate] = useState(false);

  // Recent Sales periods active states
  const [activePeriod, setActivePeriod] = useState<'today' | 'yesterday' | 'last15'>('today');
  const [selected15DaysDate, setSelected15DaysDate] = useState<string>('all');

  // Search and Pagination for Sales History
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch products for dropdown
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('id, sku, name, color, selling_price, current_stock, barcode, category_id, size_stocks, categories(name)')
        .order('name', { ascending: true });
      if (prodErr) throw prodErr;
      setProducts(prodData || []);

      // Fetch sale items directly with joined sale_date and product details
      const { data: itemsData, error: itemsErr } = await supabase
        .from('sale_items')
        .select('*, sales(sale_date), products(sku, name, color, category_id, categories(id, name))')
        .order('created_at', { ascending: false });
      if (itemsErr) throw itemsErr;
      setSaleItemsRows(itemsData as any[] || []);
    } catch (err: any) {
      showToast(err.message || 'Error loading sales', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Enable realtime sync
    const channel = supabase
      .channel('sales-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        silentReload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => {
        silentReload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const silentReload = async () => {
    const { data: itemsData } = await supabase
      .from('sale_items')
      .select('*, sales(sale_date), products(sku, name, color, category_id, categories(id, name))')
      .order('created_at', { ascending: false });
    if (itemsData) setSaleItemsRows(itemsData as any[] || []);
  };

  const handleEditPriceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;

    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
      showToast('Please enter a valid price (greater than or equal to 0)', 'warning');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to change the price for this item to ₹${price.toFixed(2)}? This will update the transaction subtotal and adjust your daily sales reports.`);
    if (!confirmed) return;

    setUpdatingPrice(true);
    try {
      // 1. Update the selling price in sale_items table
      const { error: updateErr } = await supabase
        .from('sale_items')
        .update({ selling_price: price })
        .eq('id', editingRow.id);

      if (updateErr) throw updateErr;

      // 2. Fetch all sale items for the parent sale to calculate the new total amount
      const { data: siblings, error: sibErr } = await supabase
        .from('sale_items')
        .select('quantity, selling_price')
        .eq('sale_id', editingRow.sale_id);

      if (sibErr) throw sibErr;

      // 3. Compute new total amount for the parent sale
      const newTotal = (siblings || []).reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.selling_price || 0)), 0);

      // 4. Update the total_amount in the sales table
      const { error: saleErr } = await supabase
        .from('sales')
        .update({ total_amount: newTotal })
        .eq('id', editingRow.sale_id);

      if (saleErr) throw saleErr;

      // 5. Log this price adjustment in activity logs
      await supabase.from('activity_logs').insert({
        action: 'STOCK_EDITED',
        details: `Adjusted sold price of ${editingRow.products?.sku || 'Item'} (Size: ${editingRow.size}) from ₹${editingRow.selling_price} to ₹${price} (Sale: ${editingRow.sale_id.slice(0, 8)}).`
      });

      showToast('Sale item price updated successfully', 'success');
      setIsPriceEditOpen(false);
      setEditingRow(null);
      setNewPrice('');
      fetchData(); // Reload sales tables
    } catch (err: any) {
      showToast(err.message || 'Error updating sale item price', 'error');
    } finally {
      setUpdatingPrice(false);
    }
  };

  const handleEditDateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRowForDate) return;

    if (!newDate) {
      showToast('Please select a valid date', 'warning');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to change the sale date for this transaction to ${new Date(newDate).toLocaleString('en-IN')}? This will update the timestamp for all items in this sale.`);
    if (!confirmed) return;

    setUpdatingDate(true);
    try {
      // Update the sale_date in the sales table
      const { error: saleErr } = await supabase
        .from('sales')
        .update({ sale_date: new Date(newDate).toISOString() })
        .eq('id', editingRowForDate.sale_id);

      if (saleErr) throw saleErr;

      // Log this date adjustment in activity logs
      await supabase.from('activity_logs').insert({
        action: 'PRODUCT_EDITED',
        details: `Adjusted sale date of Sale ${editingRowForDate.sale_id.slice(0, 8)} (SKU: ${editingRowForDate.products?.sku || 'N/A'}) to ${new Date(newDate).toLocaleString('en-IN')}.`
      });

      showToast('Sale date updated successfully', 'success');
      setIsDateEditOpen(false);
      setEditingRowForDate(null);
      setNewDate('');
      fetchData(); // Reload sales tables
    } catch (err: any) {
      showToast(err.message || 'Error updating sale date', 'error');
    } finally {
      setUpdatingDate(false);
    }
  };

  const getProductSizes = (p: Product) => {
    const cat = p.categories;
    const catName = cat 
      ? (Array.isArray(cat) ? cat[0]?.name : cat.name) 
      : 'Uncategorized';
    return getCategorySizesByName(catName || '');
  };

  // Dynamically update product price when selected in dynamic form items list
  const handleProductSelect = (index: number, productId: string) => {
    const p = products.find(prod => prod.id === productId);
    const updated = [...saleItems];
    
    // Determine first available size
    let defaultSize = 'One Size';
    if (p) {
      const sizes = getProductSizes(p);
      defaultSize = sizes.find(sz => (p.size_stocks?.[sz] || 0) > 0) || sizes[0] || 'One Size';
    }

    updated[index] = {
      ...updated[index],
      product_id: productId,
      size: defaultSize,
      selling_price: p ? p.selling_price : 0
    };
    setSaleItems(updated);
  };

  const handleItemChange = (index: number, field: keyof SaleItemInput, value: any) => {
    const updated = [...saleItems];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setSaleItems(updated);
  };

  const addFormItem = () => {
    setSaleItems(prev => [...prev, { product_id: '', size: 'One Size', quantity: 1, selling_price: 0 }]);
  };

  const removeFormItem = (index: number) => {
    if (saleItems.length === 1) return;
    setSaleItems(prev => prev.filter((_, i) => i !== index));
  };

  // Barcode search / auto-add
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeSearchInput.trim()) return;

    const matched = products.find(p => p.barcode.toLowerCase() === barcodeSearchInput.trim().toLowerCase() || p.sku.toLowerCase() === barcodeSearchInput.trim().toLowerCase());
    
    if (!matched) {
      showToast(`No product found with Barcode/SKU: "${barcodeSearchInput}"`, 'error');
      setBarcodeSearchInput('');
      return;
    }

    // Determine default size
    const sizes = getProductSizes(matched);
    const defaultSize = sizes.find(sz => (Number(matched.size_stocks?.[sz]) || 0) > 0) || sizes[0] || 'One Size';

    // Check if product is already in the list
    const existingIndex = saleItems.findIndex(item => item.product_id === matched.id && item.size === defaultSize);
    if (existingIndex > -1) {
      const updated = [...saleItems];
      updated[existingIndex].quantity += 1;
      setSaleItems(updated);
      showToast(`Incremented quantity of ${matched.name}`, 'success');
    } else {
      // Replace first item if it is empty, else add new
      if (saleItems.length === 1 && !saleItems[0].product_id) {
        setSaleItems([{ product_id: matched.id, size: defaultSize, quantity: 1, selling_price: matched.selling_price }]);
      } else {
        setSaleItems(prev => [...prev, { product_id: matched.id, size: defaultSize, quantity: 1, selling_price: matched.selling_price }]);
      }
      showToast(`Added "${matched.name}" (Size: ${defaultSize}) to cart`, 'success');
    }
    
    setBarcodeSearchInput('');
  };

  // View sale items details in Modal
  const viewDetails = async (sale: Sale) => {
    setActiveSale(sale);
    setIsDetailsOpen(true);
    setDetailsLoading(true);
    try {
      // 1. Fetch sale items
      const { data, error } = await supabase
        .from('sale_items')
        .select('*, products(name, sku)')
        .eq('sale_id', sale.id);
      if (error) throw error;
      setActiveDetails(data || []);

      // 2. Fetch sale parent details for exact total and date
      const { data: saleData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', sale.id)
        .single();
      if (saleData) {
        setActiveSale(saleData);
      }
    } catch (err: any) {
      showToast(err.message || 'Error loading details', 'error');
    } finally {
      setDetailsLoading(false);
    }
  };

  const openNewSaleForm = () => {
    const defaultProductId = products[0]?.id || '';
    const p = products[0];
    let defaultSize = 'One Size';
    if (p) {
      const sizes = getProductSizes(p);
      defaultSize = sizes.find(sz => (Number(p.size_stocks?.[sz]) || 0) > 0) || sizes[0] || 'One Size';
    }

    setSaleItems([{ product_id: defaultProductId, size: defaultSize, quantity: 1, selling_price: products[0]?.selling_price || 0 }]);
    setBarcodeSearchInput('');
    setIsFormOpen(true);
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate items
    const invalidItem = saleItems.find(item => !item.product_id || !item.size || item.quantity <= 0 || item.selling_price < 0);
    if (invalidItem) {
      showToast('All fields must be filled and quantity must be greater than 0', 'warning');
      return;
    }

    // Validate stocks levels before selling
    let stockValid = true;
    saleItems.forEach(item => {
      const p = products.find(prod => prod.id === item.product_id);
      if (p) {
        const sizeStock = Number(p.size_stocks?.[item.size]) || 0;
        if (sizeStock < item.quantity) {
          if (!confirm(`Warning: Stock for product "${p.name}" (Size: ${item.size}) is ${sizeStock}. You are selling ${item.quantity}. Proceed?`)) {
            stockValid = false;
          }
        }
      }
    });

    if (!stockValid) return;

    setSubmitting(true);
    try {
      // Calculate total amount
      const totalAmount = saleItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.selling_price || 0)), 0);

      // 1. Insert Sale
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({
          total_amount: totalAmount
        })
        .select()
        .single();
      if (saleErr) throw saleErr;

      // 2. Insert Sale Items (Triggers will automatically update product stocks, insert stock movements, and log activities!)
      const itemsPayload = saleItems.map(item => ({
        sale_id: saleData.id,
        product_id: item.product_id,
        size: item.size,
        quantity: item.quantity,
        selling_price: item.selling_price
      }));

      const { error: itemsErr } = await supabase
        .from('sale_items')
        .insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      // 3. Log main activity
      await supabase.from('activity_logs').insert({
        action: 'SALE_CREATED',
        details: `Recorded checkout sale transaction (ID: ${saleData.id.slice(0, 8)}) for total value ₹${totalAmount.toFixed(2)}.`
      });

      showToast('Sale Invoice recorded successfully!', 'success');
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Error recording sale transaction', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Export to Excel
  const handleExportHistory = () => {
    const wsData = filteredRows.map((row) => ({
      'Transaction ID': row.sale_id,
      'Sale Date & Time': row.sales?.sale_date ? new Date(row.sales.sale_date).toLocaleString('en-IN') : 'N/A',
      'SKU Code': row.products?.sku || 'N/A',
      'Product Name': row.products?.name || 'N/A',
      'Color': row.products?.color || 'N/A',
      'Size': row.size,
      'Quantity': row.quantity,
      'Price (₹)': row.selling_price,
      'Total (₹)': row.quantity * row.selling_price
    }));

    const ws = utils.json_to_sheet(wsData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'KY Sales Details');
    
    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `KY_Sales_Details_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    showToast('Sales detailed history exported!', 'success');
  };

  const handleExportZeroSold = (categoryName: string, items: Product[]) => {
    const wsData = items.map((row) => {
      const sizesStr = Object.entries(row.size_stocks || {})
        .filter(([_, qty]) => Number(qty) > 0)
        .map(([sz, qty]) => `${sz}(${qty})`)
        .join(', ');

      return {
        'SKU Code': row.sku,
        'Product Name': row.name || 'N/A',
        'Color': row.color || 'N/A',
        'Selling Price (₹)': row.selling_price,
        'Current Stock': row.current_stock,
        'Available Size Stocks': sizesStr || 'None'
      };
    });

    const ws = utils.json_to_sheet(wsData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Zero Sold Articles');
    
    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Zero_Sold_${categoryName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    showToast(`Exported zero sold list for ${categoryName}!`, 'success');
  };

  // Dynamic months list from saleItemsRows
  const getAvailableMonths = () => {
    const monthsSet = new Set<string>();
    saleItemsRows.forEach(row => {
      const dateStr = row.sales?.sale_date;
      if (dateStr) {
        const d = new Date(dateStr);
        const monthLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        monthsSet.add(monthLabel);
      }
    });
    // Add current month in case there are no sales yet
    const curMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
    monthsSet.add(curMonth);
    
    return Array.from(monthsSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  };

  // Filtering & Pagination
  const filteredRows = saleItemsRows.filter(row => {
    const query = searchQuery.toLowerCase().trim();
    
    // 1. Transaction/SKU/Color/Name search filter
    const matchesSearch = 
      row.sale_id.toLowerCase().includes(query) ||
      (row.products?.sku || '').toLowerCase().includes(query) ||
      (row.products?.name || '').toLowerCase().includes(query) ||
      (row.products?.color || '').toLowerCase().includes(query);

    if (!matchesSearch) return false;

    // 2. Month filter
    if (selectedMonthFilter !== 'all') {
      const dateStr = row.sales?.sale_date;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      
      if (selectedMonthFilter === 'last15') {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        if (d < fifteenDaysAgo) return false;
      } else {
        const monthLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        if (monthLabel !== selectedMonthFilter) return false;
      }
    }

    return true;
  });

  const totalSumFiltered = filteredRows.reduce((sum, row) => sum + (Number(row.quantity || 0) * Number(row.selling_price || 0)), 0);
  const totalQtyFiltered = filteredRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getSalesAnalytics = () => {
    const categorySales: Record<string, { qty: number; revenue: number }> = {};
    const productSales: Record<string, { sku: string; name: string; color: string; size: string; qty: number; revenue: number }> = {};

    saleItemsRows.forEach(row => {
      // Category wise
      const cat = row.products?.categories;
      const catName = !cat ? 'Uncategorized' : (Array.isArray(cat) ? (cat[0]?.name || 'Uncategorized') : (cat.name || 'Uncategorized'));
      if (!categorySales[catName]) {
        categorySales[catName] = { qty: 0, revenue: 0 };
      }
      categorySales[catName].qty += Number(row.quantity);
      categorySales[catName].revenue += Number(row.quantity) * Number(row.selling_price);

      // Product Variant wise (SKU + Color + Size)
      const key = `${row.products?.sku || 'N/A'}-${row.products?.color || 'N/A'}-${row.size}`;
      if (!productSales[key]) {
        productSales[key] = {
          sku: row.products?.sku || 'N/A',
          name: row.products?.name || 'Unnamed',
          color: row.products?.color || 'N/A',
          size: row.size,
          qty: 0,
          revenue: 0
        };
      }
      productSales[key].qty += Number(row.quantity);
      productSales[key].revenue += Number(row.quantity) * Number(row.selling_price);
    });

    const sortedVariants = Object.values(productSales).sort((a, b) => b.qty - a.qty);

    const hotItems = sortedVariants.slice(0, 5); // top 5
    const slowItems = [...sortedVariants].reverse().slice(0, 5); // bottom 5

    // Article wise (summing all sizes, grouping by SKU code in lowercase)
    const articleSales: Record<string, { sku: string; name: string; qty: number; revenue: number }> = {};
    saleItemsRows.forEach(row => {
      const sku = row.products?.sku;
      if (sku) {
        const skuKey = sku.toLowerCase().trim();
        if (!articleSales[skuKey]) {
          articleSales[skuKey] = {
            sku: skuKey,
            name: row.products?.name || 'Unnamed',
            qty: 0,
            revenue: 0
          };
        }
        articleSales[skuKey].qty += Number(row.quantity || 0);
        articleSales[skuKey].revenue += Number(row.quantity || 0) * Number(row.selling_price || 0);
      }
    });

    const sortedArticles = Object.values(articleSales).sort((a, b) => b.qty - a.qty);
    
    return {
      categorySales: Object.entries(categorySales).map(([name, val]) => ({ name, ...val })),
      hotItems,
      slowItems,
      rankingList: sortedVariants, // full ranking list
      articleRankingList: sortedArticles // full article ranking list
    };
  };

  const analytics = getSalesAnalytics();
  const totalSalesVal = analytics.rankingList.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const totalQtyVal = analytics.rankingList.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const uniqueItemsCount = analytics.rankingList.length;
  const sortedCategories = [...analytics.categorySales].sort((a, b) => b.qty - a.qty);
  const topCategory = sortedCategories[0]?.name || 'N/A';
  const aov = uniqueItemsCount > 0 ? totalSalesVal / uniqueItemsCount : 0;

  // Derive zero-sold articles
  const soldProductIds = new Set(saleItemsRows.map(item => item.product_id));
  const zeroSoldProducts = products.filter(p => !soldProductIds.has(p.id));

  const womenFootwearZeroSold = zeroSoldProducts.filter(p => {
    const cat = p.categories;
    const catName = !cat ? '' : (Array.isArray(cat) ? (cat[0]?.name || '') : (cat.name || ''));
    return catName.toLowerCase().trim() === 'women footwear';
  });

  const winterBootZeroSold = zeroSoldProducts.filter(p => {
    const cat = p.categories;
    const catName = !cat ? '' : (Array.isArray(cat) ? (cat[0]?.name || '') : (cat.name || ''));
    return catName.toLowerCase().trim() === 'winter boot' || catName.toLowerCase().includes('boot');
  });

  // Helper to get dates of the last 15 days
  const getLast15DaysList = () => {
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 15; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d);
    }
    return dates;
  };

  // Derive sales lists for Today, Yesterday, Last 15 Days
  const getPeriodSales = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const fifteenDaysAgo = new Date(today);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const todayMap: Record<string, { qty: number; revenue: number }> = {};
    const yesterdayMap: Record<string, { qty: number; revenue: number }> = {};
    const last15Map: Record<string, { qty: number; revenue: number }> = {};

    const todayDetailed: any[] = [];
    const yesterdayDetailed: any[] = [];
    const last15Detailed: any[] = [];

    saleItemsRows.forEach((row) => {
      const dateStr = row.sales?.sale_date || row.created_at;
      if (!dateStr) return;
      const d = new Date(dateStr);
      const sku = row.products?.sku;
      if (!sku) return;

      const qty = Number(row.quantity || 0);
      const price = Number(row.selling_price || 0);
      const subtotal = qty * price;

      const itemDetail = {
        id: row.id,
        sku,
        name: row.products?.name || 'Unnamed',
        color: row.products?.color || 'N/A',
        size: row.size,
        price,
        qty,
        subtotal,
        date: d
      };

      // Check Today
      if (d >= today) {
        if (!todayMap[sku]) todayMap[sku] = { qty: 0, revenue: 0 };
        todayMap[sku].qty += qty;
        todayMap[sku].revenue += subtotal;
        todayDetailed.push(itemDetail);
      }
      
      // Check Yesterday
      if (d >= yesterday && d < today) {
        if (!yesterdayMap[sku]) yesterdayMap[sku] = { qty: 0, revenue: 0 };
        yesterdayMap[sku].qty += qty;
        yesterdayMap[sku].revenue += subtotal;
        yesterdayDetailed.push(itemDetail);
      }

      // Check Last 15 Days
      if (d >= fifteenDaysAgo) {
        const localDateStr = d.toISOString().slice(0, 10);
        if (selected15DaysDate === 'all' || localDateStr === selected15DaysDate) {
          if (!last15Map[sku]) last15Map[sku] = { qty: 0, revenue: 0 };
          last15Map[sku].qty += qty;
          last15Map[sku].revenue += subtotal;
          last15Detailed.push(itemDetail);
        }
      }
    });

    const formatMap = (map: Record<string, { qty: number; revenue: number }>) => 
      Object.entries(map)
        .map(([sku, data]) => ({ sku, qty: data.qty, revenue: data.revenue }))
        .sort((a, b) => b.qty - a.qty);

    return {
      todaySalesList: formatMap(todayMap),
      yesterdaySalesList: formatMap(yesterdayMap),
      last15SalesList: formatMap(last15Map),
      todayDetailed: todayDetailed.sort((a, b) => b.subtotal - a.subtotal),
      yesterdayDetailed: yesterdayDetailed.sort((a, b) => b.subtotal - a.subtotal),
      last15Detailed: last15Detailed.sort((a, b) => b.subtotal - a.subtotal),
    };
  };

  const { 
    todaySalesList, 
    yesterdaySalesList, 
    last15SalesList,
    todayDetailed,
    yesterdayDetailed,
    last15Detailed
  } = getPeriodSales();

  const activeDetailedList = activePeriod === 'today' 
    ? todayDetailed 
    : activePeriod === 'yesterday' 
      ? yesterdayDetailed 
      : last15Detailed;

  const totalDetailedQty = activeDetailedList.reduce((sum, item) => sum + item.qty, 0);
  const totalDetailedRevenue = activeDetailedList.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <div className="flex flex-col gap-6 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Sales Invoice Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Record store sales, auto-deduct inventory quantities, and manage receipts.</p>
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
            onClick={openNewSaleForm}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98] text-white font-semibold text-xs tracking-wider uppercase shadow-md transition-all"
          >
            <Plus className="w-4.5 h-4.5" />
            Create Sale Entry
          </button>
        </div>
      </div>
        {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
            activeTab === 'history'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-650'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          Transactions Log
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
            activeTab === 'analytics'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-650'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          Sales Insights & Performance
        </button>
      </div>

      {activeTab === 'history' && (
        <>
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="w-4.5 h-4" />
              </span>
              <input
                type="text"
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-405"
                placeholder="Search Transaction ID, SKU, Color, Name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* Month Filter Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={selectedMonthFilter}
                onChange={(e) => {
                  setSelectedMonthFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer text-slate-700 dark:text-slate-200"
              >
                <option value="all">All Months</option>
                <option value="last15">Last 15 Days</option>
                {getAvailableMonths().map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sales History list container */}
          <div className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-20 text-center text-slate-500 font-semibold animate-pulse">Loading sales list...</div>
            ) : paginatedRows.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">No sales articles logged.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/40 text-[10px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-100 dark:border-slate-850">
                      <th className="p-4">Transaction ID</th>
                      <th className="p-4">Date & Time</th>
                      <th className="p-4">SKU Code</th>
                      <th className="p-4">Product Name</th>
                      <th className="p-4">Color</th>
                      <th className="p-4 text-center">Size</th>
                      <th className="p-4 text-center">Qty</th>
                      <th className="p-4 text-right">Unit Price</th>
                      <th className="p-4 text-right">Subtotal</th>
                      <th className="p-4 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {paginatedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-all">
                        <td className="p-4 text-xs font-mono font-bold text-indigo-550 dark:text-indigo-400" title={row.sale_id}>{row.sale_id.slice(0, 8)}</td>
                        <td className="p-4 text-xs font-semibold">
                          <div className="flex items-center justify-between gap-1.5 group/date">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                              <span>{row.sales?.sale_date ? new Date(row.sales.sale_date).toLocaleString('en-IN') : 'N/A'}</span>
                            </div>
                            <button
                              onClick={() => {
                                setEditingRowForDate(row);
                                if (row.sales?.sale_date) {
                                  const d = new Date(row.sales.sale_date);
                                  const tzoffset = d.getTimezoneOffset() * 60000;
                                  const localISOTime = (new Date(d.getTime() - tzoffset)).toISOString().slice(0, 16);
                                  setNewDate(localISOTime);
                                } else {
                                  setNewDate('');
                                }
                                setIsDateEditOpen(true);
                              }}
                              className="opacity-100 lg:opacity-0 lg:group-hover/date:opacity-100 p-1 rounded hover:bg-slate-250 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-500 transition-all cursor-pointer animate-none"
                              title="Edit Sale Date"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-xs font-mono text-slate-700 dark:text-slate-300">{row.products?.sku || 'N/A'}</td>
                        <td className="p-4 text-xs font-semibold max-w-[150px] truncate" title={row.products?.name}>{row.products?.name || 'N/A'}</td>
                        <td className="p-4 text-xs font-medium text-slate-500 dark:text-slate-400">{row.products?.color || 'N/A'}</td>
                        <td className="p-4 text-center text-xs font-bold text-slate-500">{row.size}</td>
                        <td className="p-4 text-center text-xs font-extrabold text-slate-700 dark:text-slate-300">{row.quantity}</td>
                        <td className="p-4 text-right font-mono text-xs">
                          <div className="flex items-center justify-end gap-1.5 group/price">
                            <span>₹{row.selling_price.toFixed(2)}</span>
                            <button
                              onClick={() => {
                                setEditingRow(row);
                                setNewPrice(String(row.selling_price));
                                setIsPriceEditOpen(true);
                              }}
                              className="opacity-100 lg:opacity-0 lg:group-hover/price:opacity-100 p-1 rounded hover:bg-slate-250 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-500 transition-all cursor-pointer"
                              title="Edit Price"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                          <div className="flex items-center justify-end gap-1.5 group/subtotal">
                            <span>₹{(row.quantity * row.selling_price).toFixed(2)}</span>
                            <button
                              onClick={() => {
                                setEditingRow(row);
                                setNewPrice(String(row.selling_price));
                                setIsPriceEditOpen(true);
                              }}
                              className="opacity-100 lg:opacity-0 lg:group-hover/subtotal:opacity-100 p-1 rounded hover:bg-slate-250 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-500 transition-all cursor-pointer"
                              title="Change Price"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => viewDetails({
                              id: row.sale_id,
                              sale_date: row.sales?.sale_date || '',
                              total_amount: 0,
                              created_at: row.sales?.sale_date || ''
                            })}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-all active:scale-95"
                            title="View Full Invoice Receipt"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100/50 dark:bg-slate-950/70 border-t-2 border-slate-200 dark:border-slate-800 font-extrabold text-xs">
                      <td className="p-4" colSpan={5}>Grand Total</td>
                      <td className="p-4 text-center">-</td>
                      <td className="p-4 text-center text-slate-800 dark:text-slate-200">{totalQtyFiltered} pcs</td>
                      <td className="p-4 text-right">-</td>
                      <td className="p-4 text-right text-emerald-600 dark:text-emerald-400 font-mono text-sm" colSpan={2}>₹{totalSumFiltered.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/50">
                <span className="text-xs text-slate-555 font-medium">Page {currentPage} of {totalPages}</span>
                <div className="flex gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Sales Revenue</span>
                <span className="text-2xl font-extrabold text-slate-800 dark:text-white mt-2">₹{totalSalesVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                <span className="text-[10px] text-slate-450 dark:text-slate-500 mt-1">Sum of all transaction subtotals</span>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Units Sold</span>
                <span className="text-2xl font-extrabold text-indigo-650 dark:text-indigo-400 mt-2">{totalQtyVal} pcs</span>
                <span className="text-[10px] text-slate-455 dark:text-slate-500 mt-1">Across {uniqueItemsCount} distinct variants</span>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top Performing Category</span>
                <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-450 mt-2 truncate">{topCategory}</span>
                <span className="text-[10px] text-slate-455 dark:text-slate-500 mt-1">Highest quantity sold</span>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Sales Value / Variant</span>
                <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-450 mt-2">₹{aov.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className="text-[10px] text-slate-455 dark:text-slate-500 mt-1">Revenue divided by distinct items</span>
              </div>
            </div>

            {/* Recent Sales Periods Summary (Today, Yesterday, Last 15 Days) */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
              <div>
                <h3 className="font-extrabold text-slate-850 dark:text-white text-base">📅 Sales by Time Period</h3>
                <p className="text-[10px] text-slate-400">Sold articles and SKU codes during Today, Yesterday, and the Last 15 Days.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Today */}
                <div 
                  onClick={() => setActivePeriod('today')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-3 ${
                    activePeriod === 'today'
                      ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/5 shadow-md ring-2 ring-indigo-500/20'
                      : 'border-slate-100 dark:border-slate-850 bg-slate-50/30 dark:bg-slate-950/10 hover:border-slate-250 dark:hover:border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-805">
                    <span className="text-xs font-extrabold text-indigo-650 dark:text-indigo-400">Today</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      {todaySalesList.reduce((sum, item) => sum + item.qty, 0)} pcs
                    </span>
                  </div>
                  <div className="space-y-2 overflow-y-auto max-h-40 pr-1">
                    {todaySalesList.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-350">{item.sku}</span>
                        <span className="text-slate-500 font-semibold">{item.qty} pcs</span>
                      </div>
                    ))}
                    {todaySalesList.length === 0 && (
                      <div className="text-center py-8 text-xs text-slate-400">No articles sold today.</div>
                    )}
                  </div>
                </div>

                {/* Yesterday */}
                <div 
                  onClick={() => setActivePeriod('yesterday')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-3 ${
                    activePeriod === 'yesterday'
                      ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/5 shadow-md ring-2 ring-indigo-500/20'
                      : 'border-slate-100 dark:border-slate-850 bg-slate-50/30 dark:bg-slate-950/10 hover:border-slate-250 dark:hover:border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-805">
                    <span className="text-xs font-extrabold text-indigo-650 dark:text-indigo-400">Yesterday</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      {yesterdaySalesList.reduce((sum, item) => sum + item.qty, 0)} pcs
                    </span>
                  </div>
                  <div className="space-y-2 overflow-y-auto max-h-40 pr-1">
                    {yesterdaySalesList.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-350">{item.sku}</span>
                        <span className="text-slate-500 font-semibold">{item.qty} pcs</span>
                      </div>
                    ))}
                    {yesterdaySalesList.length === 0 && (
                      <div className="text-center py-8 text-xs text-slate-400">No articles sold yesterday.</div>
                    )}
                  </div>
                </div>

                {/* Last 15 Days */}
                <div 
                  onClick={() => setActivePeriod('last15')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-3 ${
                    activePeriod === 'last15'
                      ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/5 shadow-md ring-2 ring-indigo-500/20'
                      : 'border-slate-100 dark:border-slate-855 bg-slate-50/30 dark:bg-slate-950/10 hover:border-slate-250 dark:hover:border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-805" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs font-extrabold text-indigo-650 dark:text-indigo-400">Last 15 Days</span>
                    
                    <select
                      value={selected15DaysDate}
                      onChange={(e) => {
                        setSelected15DaysDate(e.target.value);
                        setActivePeriod('last15');
                      }}
                      className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold focus:outline-none cursor-pointer max-w-[120px]"
                    >
                      <option value="all">All 15 Days</option>
                      {getLast15DaysList().map((d) => {
                        const val = d.toISOString().slice(0, 10);
                        const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                        return (
                          <option key={val} value={val}>{label}</option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-2 overflow-y-auto max-h-40 pr-1">
                    {last15SalesList.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-350">{item.sku}</span>
                        <span className="text-slate-500 font-semibold">{item.qty} pcs</span>
                      </div>
                    ))}
                    {last15SalesList.length === 0 && (
                      <div className="text-center py-8 text-xs text-slate-400">No articles sold in last 15 days.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Detailed Sales List for Active Period */}
              <div className="mt-2 p-4 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/50 flex flex-col gap-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-150 dark:border-slate-800">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    📋 Detailed Sales List: {activePeriod === 'today' ? 'Today' : activePeriod === 'yesterday' ? 'Yesterday' : 'Last 15 Days'}
                  </h4>
                  <span className="text-[10px] text-slate-455 font-bold bg-indigo-500/10 text-indigo-650 px-2 py-0.5 rounded">
                    Showing {activeDetailedList.length} articles
                  </span>
                </div>
                
                <div className="overflow-x-auto overflow-y-auto max-h-[520px] border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950/90 backdrop-blur-sm z-10 font-bold uppercase tracking-wider text-slate-400 text-[10px] border-b border-slate-200 dark:border-slate-805">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">SKU Code</th>
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Color</th>
                        <th className="py-2.5 px-3 text-center">Size</th>
                        <th className="py-2.5 px-3 text-right">Price</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 dark:divide-slate-855">
                      {activeDetailedList.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-100/30 dark:hover:bg-slate-855/10 transition-all">
                          <td className="py-2 px-3 text-slate-500 font-medium whitespace-nowrap">{new Date(row.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                          <td className="py-2 px-3 font-mono font-bold text-indigo-650 dark:text-indigo-400">{row.sku}</td>
                          <td className="py-2 px-3 text-slate-700 dark:text-slate-300 truncate max-w-[150px]" title={row.name}>{row.name}</td>
                          <td className="py-2 px-3 text-slate-500">{row.color}</td>
                          <td className="py-2 px-3 text-center font-bold text-slate-600 dark:text-slate-400">{row.size}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold">₹{row.price.toFixed(2)}</td>
                          <td className="py-2 px-3 text-center font-extrabold text-slate-750 dark:text-slate-300">{row.qty}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-650 dark:text-emerald-450">₹{row.subtotal.toFixed(2)}</td>
                        </tr>
                      ))}
                      {activeDetailedList.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-450 font-semibold">No sales recorded for this period.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total Row */}
                <div className="flex justify-between items-center pt-3 border-t border-slate-150 dark:border-slate-800 font-extrabold text-xs text-slate-800 dark:text-white bg-slate-100/20 dark:bg-slate-950/20 px-4 py-2.5 rounded-lg uppercase tracking-wider">
                  <span>Total Articles: <strong className="font-sans text-indigo-600 dark:text-indigo-400 ml-1">{totalDetailedQty} pcs</strong></span>
                  <span>Total Price: <strong className="font-mono text-emerald-600 dark:text-emerald-450 ml-1">₹{totalDetailedRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Category Sales Table */}
              <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                <div>
                  <h3 className="font-extrabold text-slate-850 dark:text-white text-base">Category-Wise Sales</h3>
                  <p className="text-[10px] text-slate-400">Detailed breakdown of sales quantity and revenue per category.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-450">
                        <th className="py-2.5">Category</th>
                        <th className="py-2.5 text-center">Qty</th>
                        <th className="py-2.5 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                      {sortedCategories.map((cat, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/20 dark:hover:bg-slate-850/5">
                          <td className="py-2 font-semibold text-slate-700 dark:text-slate-350">{cat.name}</td>
                          <td className="py-2 text-center font-bold">{cat.qty}</td>
                          <td className="py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{cat.revenue.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                      {sortedCategories.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-slate-400">No category sales recorded.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Hot and Slow Products */}
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Hot Selling Products */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-rose-600 dark:text-rose-450 text-base">🔥 Hot Selling Products</h3>
                      <p className="text-[10px] text-slate-400">Top 5 fast-moving product variant combinations.</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {analytics.hotItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2.5 rounded-xl border border-slate-100 dark:border-slate-855 bg-slate-50/30 dark:bg-slate-950/10">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-xs text-rose-600 dark:text-rose-455">{item.sku}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/15">Size {item.size}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{item.name} ({item.color})</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{item.qty} pcs sold</div>
                          <div className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{item.revenue.toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                    ))}
                    {analytics.hotItems.length === 0 && (
                      <div className="py-12 text-center text-xs text-slate-400">No hot selling variants recorded.</div>
                    )}
                  </div>
                </div>

                {/* Slow Moving Products */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                  <div>
                    <h3 className="font-extrabold text-indigo-650 dark:text-indigo-400 text-base">❄️ Slow Moving Products</h3>
                    <p className="text-[10px] text-slate-400">Variants with the lowest quantities sold.</p>
                  </div>
                  <div className="space-y-3">
                    {analytics.slowItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2.5 rounded-xl border border-slate-100 dark:border-slate-855 bg-slate-50/30 dark:bg-slate-950/10">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-xs text-indigo-655 dark:text-indigo-405">{item.sku}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 border border-indigo-500/15">Size {item.size}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{item.name} ({item.color})</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{item.qty} pcs sold</div>
                          <div className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{item.revenue.toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                    ))}
                    {analytics.slowItems.length === 0 && (
                      <div className="py-12 text-center text-xs text-slate-400">No slow moving variants recorded.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Hot Selling Code Leaderboard Table */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
              <div>
                <h3 className="font-extrabold text-slate-850 dark:text-white text-base">🔥 Hot Selling Code</h3>
                <p className="text-[10px] text-slate-400 font-medium font-sans">Ranked leaderboard of articles (grouped across all sizes/colors as SKU code) ordered by quantities sold.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-450 bg-slate-50 dark:bg-slate-950/20">
                      <th className="py-3 px-4 text-center w-16">Rank</th>
                      <th className="py-3 px-4">SKU Code</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4 text-center w-32">Total Units Sold</th>
                      <th className="py-3 px-4 text-right w-44">Revenue Generated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-855">
                    {analytics.articleRankingList.map((item, idx) => (
                      <tr key={item.sku} className="hover:bg-slate-50/20 dark:hover:bg-slate-855/5 transition-all">
                        <td className="py-3 px-4 text-center font-bold text-slate-400">
                          {idx + 1 === 1 ? '🥇' : idx + 1 === 2 ? '🥈' : idx + 1 === 3 ? '🥉' : `#${idx + 1}`}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-indigo-650 dark:text-indigo-400">{item.sku}</td>
                        <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-350">{item.name || <span className="text-slate-400 italic">Unnamed Article</span>}</td>
                        <td className="py-3 px-4 text-center font-extrabold text-slate-850 dark:text-slate-200">
                          <span className="inline-flex px-2 py-0.5 rounded font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            {item.qty} pcs
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-650 dark:text-emerald-450">₹{item.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {analytics.articleRankingList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 font-semibold">No transactions recorded yet to generate ranking.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fast Moving Ranking Leaderboard Table */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
              <div>
                <h3 className="font-extrabold text-slate-850 dark:text-white text-base">📊 Product Variant Sales Leaderboard</h3>
                <p className="text-[10px] text-slate-400 font-medium">Ranked leaderboard of all product sizes ordered by quantities sold.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-450 bg-slate-50 dark:bg-slate-950/20">
                      <th className="py-3 px-4 text-center">Rank</th>
                      <th className="py-3 px-4">SKU Code</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4">Color</th>
                      <th className="py-3 px-4 text-center">Size</th>
                      <th className="py-3 px-4 text-center">Units Sold</th>
                      <th className="py-3 px-4 text-right">Revenue Generated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-855">
                    {analytics.rankingList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/20 dark:hover:bg-slate-855/5">
                        <td className="py-3 px-4 text-center font-bold text-slate-400">
                          {idx + 1 === 1 ? '🥇' : idx + 1 === 2 ? '🥈' : idx + 1 === 3 ? '🥉' : `#${idx + 1}`}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-indigo-650 dark:text-indigo-400">{item.sku}</td>
                        <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-350">{item.name}</td>
                        <td className="py-3 px-4 font-semibold text-slate-500">{item.color}</td>
                        <td className="py-3 px-4 text-center font-bold">{item.size}</td>
                        <td className="py-3 px-4 text-center font-extrabold text-slate-800 dark:text-slate-200">
                          <span className="inline-flex px-2 py-0.5 rounded font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            {item.qty}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-650 dark:text-emerald-450">₹{item.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {analytics.rankingList.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">No transactions recorded yet to generate ranking.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Zero Sold Articles Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Women Footwear Zero Sold Articles */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="font-extrabold text-slate-850 dark:text-white text-base">❄️ Zero Sold: Women Footwear</h3>
                    <p className="text-[10px] text-slate-400">Articles with 0 sales in the Women Footwear category.</p>
                  </div>
                  <button
                    onClick={() => handleExportZeroSold('Women Footwear', womenFootwearZeroSold)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-[10px] tracking-wider uppercase transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Excel
                  </button>
                </div>
                <div className="overflow-x-auto max-h-[350px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-450 bg-slate-50 dark:bg-slate-950/20">
                        <th className="py-2.5 px-3">SKU Code</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">Color</th>
                        <th className="py-2.5 px-3 text-center">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-855">
                      {womenFootwearZeroSold.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-855/5 transition-all">
                          <td className="py-2.5 px-3 font-mono font-bold text-indigo-650 dark:text-indigo-400">{item.sku}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-350 truncate max-w-[150px]" title={item.name}>{item.name || 'Unnamed'}</td>
                          <td className="py-2.5 px-3 text-slate-500">{item.color || 'N/A'}</td>
                          <td className="py-2.5 px-3 text-center font-bold">{item.current_stock}</td>
                        </tr>
                      ))}
                      {womenFootwearZeroSold.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400 font-semibold">No zero sold articles found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Winter Boot Zero Sold Articles */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="font-extrabold text-slate-850 dark:text-white text-base">❄️ Zero Sold: Winter Boot</h3>
                    <p className="text-[10px] text-slate-400">Articles with 0 sales in the Winter Boot category.</p>
                  </div>
                  <button
                    onClick={() => handleExportZeroSold('Winter Boot', winterBootZeroSold)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-[10px] tracking-wider uppercase transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Excel
                  </button>
                </div>
                <div className="overflow-x-auto max-h-[350px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-450 bg-slate-50 dark:bg-slate-950/20">
                        <th className="py-2.5 px-3">SKU Code</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">Color</th>
                        <th className="py-2.5 px-3 text-center">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-855">
                      {winterBootZeroSold.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-855/5 transition-all">
                          <td className="py-2.5 px-3 font-mono font-bold text-indigo-650 dark:text-indigo-400">{item.sku}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-350 truncate max-w-[150px]" title={item.name}>{item.name || 'Unnamed'}</td>
                          <td className="py-2.5 px-3 text-slate-500">{item.color || 'N/A'}</td>
                          <td className="py-2.5 px-3 text-center font-bold">{item.current_stock}</td>
                        </tr>
                      ))}
                      {winterBootZeroSold.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400 font-semibold">No zero sold articles found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
      )}

      {/* 1. Create Sale Entry Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Record New Sales Receipt"
      >
        <div className="space-y-5">
          {/* Barcode scan search bar */}
          <form onSubmit={handleBarcodeSubmit} className="flex gap-2 p-3 bg-indigo-50/40 dark:bg-slate-950/20 border border-indigo-500/10 rounded-xl items-center">
            <span className="text-indigo-500"><BarcodeIcon className="w-5 h-5" /></span>
            <input
              type="text"
              className="flex-1 bg-transparent border-none p-0 focus:ring-0 text-xs font-semibold placeholder:text-slate-400"
              placeholder="Quick-Add via Barcode Scanner or SKU..."
              value={barcodeSearchInput}
              onChange={(e) => setBarcodeSearchInput(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-1 bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider"
            >
              Add Item
            </button>
          </form>

          <form onSubmit={handleSaleSubmit} className="space-y-5">
            {/* Dynamic Sales items listing */}
            <div className="space-y-3 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Checkout Items Cart</span>
                <button
                  type="button"
                  onClick={addFormItem}
                  className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-indigo-500 rounded-lg text-xs font-bold transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Custom</span>
                </button>
              </div>

              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {saleItems.map((item, idx) => {
                  const selProd = products.find(p => p.id === item.product_id);
                  const sizes = selProd ? getProductSizes(selProd) : ['One Size'];
                  const isExceeded = selProd && (selProd.size_stocks?.[item.size] || 0) < item.quantity;
                  
                  return (
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

                      {/* Select Size */}
                      <div className="w-full sm:w-28 space-y-1">
                        <label className="text-[10px] font-semibold text-slate-400">Size *</label>
                        <select
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-xs focus:ring-indigo-500 cursor-pointer"
                          value={item.size}
                          onChange={(e) => handleItemChange(idx, 'size', e.target.value)}
                        >
                          {sizes.map(sz => (
                            <option key={sz} value={sz} className="dark:bg-slate-900">
                              {sz} (Stock: {Number(selProd?.size_stocks?.[sz]) || 0})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div className="w-full sm:w-20 space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-semibold text-slate-400">Qty *</label>
                          {isExceeded && (
                            <span className="text-[8px] font-bold text-red-500 uppercase animate-pulse">Low stock</span>
                          )}
                        </div>
                        <input
                          type="number"
                          required
                          min="1"
                          className={`w-full px-2.5 py-1.5 rounded-lg border bg-transparent text-xs ${
                            isExceeded ? 'border-red-500/50 focus:ring-red-500' : 'border-slate-250 dark:border-slate-800 focus:ring-indigo-550'
                          }`}
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        />
                      </div>

                      {/* Selling price */}
                      <div className="w-full sm:w-28 space-y-1">
                        <label className="text-[10px] font-semibold text-slate-400">Selling Price (₹) *</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          min="0"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-xs"
                          value={item.selling_price || ''}
                          onChange={(e) => handleItemChange(idx, 'selling_price', Number(e.target.value))}
                        />
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        disabled={saleItems.length === 1}
                        onClick={() => removeFormItem(idx)}
                        className="p-2 border border-slate-200 dark:border-slate-800 hover:border-red-500/30 hover:bg-red-500/10 text-slate-400 hover:text-red-500 rounded-lg transition-all disabled:opacity-40"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Form Actions */}
            <div className="pt-4 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-bold text-slate-500">
                Receipt Grand Total: <span className="text-emerald-600 dark:text-emerald-400 font-mono text-sm ml-1">
                  ₹{saleItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.selling_price || 0)), 0).toFixed(2)}
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
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 min-w-[120px] flex justify-center"
                >
                  {submitting ? 'Recording...' : 'Log Sale'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </Modal>

      {/* 2. Sales Details Modal */}
      <Modal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title={`Sales Receipt: ID ${activeSale?.id.slice(0, 8)}`}
      >
        <div className="space-y-4 font-sans select-none">
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-850 text-xs font-semibold text-slate-500">
            <span>Transaction: <strong className="text-slate-850 dark:text-slate-200 font-mono">{activeSale?.id}</strong></span>
            <span className="text-right">Sale Date: <strong>{activeSale && new Date(activeSale.sale_date).toLocaleString()}</strong></span>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {detailsLoading ? (
              <div className="py-10 text-center animate-pulse text-slate-500 font-semibold">Loading items details...</div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/40 font-bold uppercase text-slate-400 border-b border-slate-100 dark:border-slate-850">
                    <th className="p-3">SKU</th>
                    <th className="p-3">Product Name</th>
                    <th className="p-3 text-center">Size</th>
                    <th className="p-3 text-center">Quantity</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {activeDetails.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors">
                      <td className="p-3 font-mono font-semibold text-indigo-500">{item.products?.sku}</td>
                      <td className="p-3 font-medium">{item.products?.name}</td>
                      <td className="p-3 text-center font-bold text-slate-500">{item.size || 'One Size'}</td>
                      <td className="p-3 text-center font-bold">{item.quantity}</td>
                      <td className="p-3 text-right font-mono">₹{item.selling_price.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-semibold">₹{(item.quantity * item.selling_price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800 font-bold">
            <span className="text-xs text-slate-400">Recorded At: {activeSale && new Date(activeSale.created_at).toLocaleString()}</span>
            <span className="text-sm">Revenue Total: <strong className="font-mono text-emerald-600 dark:text-emerald-400 ml-1">₹{activeSale?.total_amount.toFixed(2)}</strong></span>
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

      {/* 3. Edit Price Modal */}
      <Modal
        isOpen={isPriceEditOpen}
        onClose={() => {
          setIsPriceEditOpen(false);
          setEditingRow(null);
          setNewPrice('');
        }}
        title="Edit Sale Item Price"
      >
        <form onSubmit={handleEditPriceSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">SKU Code</label>
            <input
              type="text"
              readOnly
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-850 text-slate-550 font-mono text-sm focus:outline-none"
              value={editingRow?.products?.sku || ''}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Size</label>
              <input
                type="text"
                readOnly
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-850 text-slate-550 font-semibold text-sm focus:outline-none text-center"
                value={editingRow?.size || ''}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Quantity</label>
              <input
                type="text"
                readOnly
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-850 text-slate-550 font-semibold text-sm focus:outline-none text-center"
                value={editingRow?.quantity || ''}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Selling Price (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-semibold font-mono"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
          </div>
          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsPriceEditOpen(false);
                setEditingRow(null);
                setNewPrice('');
              }}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingPrice}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 min-w-[120px] flex justify-center"
            >
              {updatingPrice ? 'Saving...' : 'Save Price'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. Edit Date Modal */}
      <Modal
        isOpen={isDateEditOpen}
        onClose={() => {
          setIsDateEditOpen(false);
          setEditingRowForDate(null);
          setNewDate('');
        }}
        title="Edit Sale Date"
      >
        <form onSubmit={handleEditDateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Transaction ID</label>
            <input
              type="text"
              readOnly
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-850 text-slate-550 font-mono text-sm focus:outline-none"
              value={editingRowForDate?.sale_id || ''}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">SKU Code</label>
            <input
              type="text"
              readOnly
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-850 text-slate-550 font-mono text-sm focus:outline-none"
              value={editingRowForDate?.products?.sku || ''}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Sale Date & Time</label>
            <input
              type="datetime-local"
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsDateEditOpen(false);
                setEditingRowForDate(null);
                setNewDate('');
              }}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingDate}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 min-w-[120px] flex justify-center"
            >
              {updatingDate ? 'Saving...' : 'Save Date'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
