'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';
import { write, utils } from 'xlsx';
import Modal from '@/components/ui/modal';
import { 
  BarChart3, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  Coins, 
  Layers, 
  AlertTriangle,
  ShoppingCart,
  Calendar,
  FileSpreadsheet,
  Trash2,
  Truck,
  Plus
} from 'lucide-react';

const SIZE_PRESETS: Record<string, string[]> = {
  'Mens Footwear': ['40', '41', '42', '43', '44', '45'],
  'Women Footwear': ['35', '36', '37', '38', '39', '40', '41'],
  'Winter Boot': ['35', '36', '37', '38', '39', '40', '41'],
  'Winter Boots': ['35', '36', '37', '38', '39', '40', '41'],
  'Mens Jacket': ['S', 'M', 'L', 'XL', 'XXL'],
  'Apparels': ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  'Shades': ['One Size'],
  'Bags': ['One Size'],
  'Gift Bag': ['One Size']
};

const getSizePreset = (catName: string): string[] => {
  const name = (catName || '').trim();
  if (SIZE_PRESETS[name]) return SIZE_PRESETS[name];

  const lower = name.toLowerCase();
  if (lower.includes('women') || lower.includes('boot')) {
    return ['35', '36', '37', '38', '39', '40', '41'];
  }
  if (lower.includes('footwear') || lower.includes('men')) {
    return ['40', '41', '42', '43', '44', '45'];
  }
  if (lower.includes('jacket') || lower.includes('apparel')) {
    return ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  }
  return ['One Size'];
};

const formatArticleCode = (sku: string, color: string, size: string, catName: string): string => {
  let cleanSku = (sku || '').trim().toLowerCase();
  cleanSku = cleanSku.replace(/^(sg-)+/gi, 'sg-').replace(/^(sa-)+/gi, 'sa-').replace(/^(sgm-)+/gi, 'sgm-');
  cleanSku = cleanSku.replace(/-([a-z0-9]+)-\1$/gi, '-$1');
  const cleanColor = (color || '').trim().toLowerCase().replace(/\s+/g, '-');
  let cleanSize = (size || '').trim().toLowerCase();
  
  const isFootwear = (catName || '').toLowerCase().includes('footwear') || (catName || '').toLowerCase().includes('boot');
  if (isFootwear && /^\d+$/.test(cleanSize) && !cleanSize.endsWith('eu')) {
    cleanSize = cleanSize + 'eu';
  }

  let prefix = '';
  let skuBody = cleanSku;

  if (cleanSku.startsWith('sg-f-')) {
    prefix = 'sg-f-';
    skuBody = cleanSku.slice(5);
  } else if (cleanSku.startsWith('sa-f-')) {
    prefix = 'sa-f-';
    skuBody = cleanSku.slice(5);
  } else if (cleanSku.startsWith('sgm-')) {
    prefix = 'sgm-';
    skuBody = cleanSku.slice(4);
  } else if (cleanSku.startsWith('sg-j-')) {
    prefix = 'sg-j-';
    skuBody = cleanSku.slice(5);
  } else if (cleanSku.startsWith('sg-a-')) {
    prefix = 'sg-a-';
    skuBody = cleanSku.slice(5);
  } else if (cleanSku.startsWith('sa-')) {
    prefix = 'sa-';
    skuBody = cleanSku.slice(3);
  } else if (cleanSku.startsWith('sg-')) {
    prefix = 'sg-';
    skuBody = cleanSku.slice(3);
  } else {
    const catNameLower = (catName || '').toLowerCase();
    if (catNameLower.includes('women footwear') || catNameLower.includes('winter boot')) {
      prefix = 'sg-f-';
    } else if (catNameLower.includes('mens footwear')) {
      prefix = 'sgm-';
    } else if (catNameLower.includes('mens jacket')) {
      prefix = 'sg-j-';
    } else if (catNameLower.includes('apparels')) {
      prefix = 'sg-a-';
    } else {
      prefix = 'sg-';
    }
  }

  skuBody = skuBody.replace(/^-+|-+$/g, '');

  if (cleanColor && cleanColor !== 'n/a') {
    const colorSuffix = `-${cleanColor}`;
    if (skuBody.endsWith(colorSuffix)) {
      skuBody = skuBody.slice(0, -colorSuffix.length);
    }
  }

  skuBody = skuBody.replace(/^-+|-+$/g, '');
  return `${prefix}${skuBody}-${cleanColor}-${cleanSize}`.toLowerCase();
};

const getSourceText = (reason: string): string => {
  if (!reason) return 'Other';
  const rLower = reason.toLowerCase();
  if (rLower.includes('sold from warehouse')) {
    return 'Sold from Warehouse';
  }
  if (rLower.includes('sale of size')) {
    return 'Sold from Inventory';
  }
  if (rLower.includes('warehouse dispatch sale')) {
    return 'Warehouse Dispatch Sale';
  }
  if (rLower.includes('warehouse dispatch bulk remove')) {
    return 'Warehouse Dispatch Bulk Remove';
  }
  return reason;
};

interface ProductReportInfo {
  sku: string;
  name: string;
  category: string;
  current_stock: number;
  minimum_stock_alert: number;
  purchase_price: number;
  selling_price: number;
  stock_value: number;
  barcode?: string;
  size_stocks?: Record<string, number>;
  size?: string;
}

interface CategoryReportInfo {
  name: string;
  products_count: number;
  total_stock: number;
  stock_value: number;
}

interface ProfitReportInfo {
  sales_revenue: number;
  purchase_costs: number;
  gross_profit: number;
  profit_margin: number;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  
  // Analytics State
  const [inventoryReport, setInventoryReport] = useState<ProductReportInfo[]>([]);
  const [lowStockReport, setLowStockReport] = useState<ProductReportInfo[]>([]);
  const [categoryReport, setCategoryReport] = useState<CategoryReportInfo[]>([]);
  const [profitReport, setProfitReport] = useState<ProfitReportInfo>({
    sales_revenue: 0,
    purchase_costs: 0,
    gross_profit: 0,
    profit_margin: 0
  });

  const [totalSalesCount, setTotalSalesCount] = useState(0);
  const [totalPurchasesCount, setTotalPurchasesCount] = useState(0);
  const [totalWarehouseSent, setTotalWarehouseSent] = useState(0);
  const [totalReplenished, setTotalReplenished] = useState(0);
  const [totalSoldOut, setTotalSoldOut] = useState(0);
  const [resetting, setResetting] = useState(false);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [isRemoveCategoryModalOpen, setIsRemoveCategoryModalOpen] = useState(false);
  const [selectedCategoryIdToRemove, setSelectedCategoryIdToRemove] = useState('');
  const [removingCategory, setRemovingCategory] = useState(false);
  const [clearingWarehouse, setClearingWarehouse] = useState(false);

  const handleSystemReset = async () => {
    const password = prompt('Enter the administrator password to reset all system database records:');
    if (password === null) return;

    if (password !== 'Krishan@123') {
      showToast('Incorrect administrator password!', 'error');
      return;
    }

    if (!confirm('Are you absolutely sure you want to delete all inventory products, sales, purchases, and audit activity logs? This action is permanent and cannot be undone.')) {
      return;
    }

    try {
      setResetting(true);
      
      const { error: saleItemsErr } = await supabase.from('sale_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (saleItemsErr) throw saleItemsErr;

      const { error: purchItemsErr } = await supabase.from('purchase_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (purchItemsErr) throw purchItemsErr;

      const { error: stockMovErr } = await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (stockMovErr) throw stockMovErr;

      const { error: salesErr } = await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (salesErr) throw salesErr;

      const { error: purchasesErr } = await supabase.from('purchases').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (purchasesErr) throw purchasesErr;

      const { error: activityErr } = await supabase.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (activityErr) throw activityErr;

      const { error: productsErr } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (productsErr) throw productsErr;

      showToast('All system data has been successfully cleared!', 'success');
      fetchReportsData();
    } catch (err: any) {
      showToast(err.message || 'Error occurred during database reset', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    try {
      setAddingCategory(true);
      
      const { data: existing, error: checkErr } = await supabase
        .from('categories')
        .select('*')
        .eq('name', newCategoryName.trim());
      
      if (checkErr) throw checkErr;
      
      if (existing && existing.length > 0) {
        showToast('This category already exists!', 'warning');
        return;
      }

      const { error: insertErr } = await supabase
        .from('categories')
        .insert({ name: newCategoryName.trim() });
      
      if (insertErr) throw insertErr;

      showToast(`Category "${newCategoryName.trim()}" created successfully!`, 'success');
      setNewCategoryName('');
      setIsCategoryModalOpen(false);
      
      fetchReportsData();
    } catch (err: any) {
      showToast(err.message || 'Error adding category', 'error');
    } finally {
      setAddingCategory(false);
    }
  };

  const fetchReportsData = async () => {
    try {
      setLoading(true);

      // 1. Query products and categories
      const { data: products, error: prodErr } = await supabase
        .from('products')
        .select('*, categories(name)');
      if (prodErr) throw prodErr;

      const { data: categoriesData, error: catErr } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      if (catErr) throw catErr;
      const categoriesList = categoriesData || [];
      setCategories(categoriesList);

      // 2. Query sales total
      const { data: sales, error: salesErr } = await supabase
        .from('sales')
        .select('id, total_amount');
      if (salesErr) throw salesErr;

      // 3. Query purchases total
      const { data: purchases, error: purchErr } = await supabase
        .from('purchases')
        .select('id, total_amount');
      if (purchErr) throw purchErr;

      // 4. Query send warehouse total
      const { data: whMovements, error: whErr } = await supabase
        .from('stock_movements')
        .select('quantity')
        .eq('type', 'OUT')
        .like('reason', 'Send Warehouse | Size: %');
      
      const totalSent = whErr ? 0 : (whMovements?.reduce((sum, m) => sum + Number(m.quantity || 0), 0) || 0);
      setTotalWarehouseSent(totalSent);

      // 5. Query total replenishment
      const { data: repMovements, error: repErr } = await supabase
        .from('stock_movements')
        .select('quantity')
        .eq('type', 'IN')
        .ilike('reason', 'Bulk Replenishment%');
      const totalRep = repErr ? 0 : (repMovements?.reduce((sum, m) => sum + Number(m.quantity || 0), 0) || 0);
      setTotalReplenished(totalRep);

      // 6. Query total sold out
      const { data: outMovements, error: outErr } = await supabase
        .from('stock_movements')
        .select('quantity, reason')
        .eq('type', 'OUT');
      let totalOut = 0;
      if (!outErr && outMovements) {
        outMovements.forEach(m => {
          const r = (m.reason || '').toLowerCase();
          if (!r.includes('send warehouse')) {
            totalOut += Number(m.quantity || 0);
          }
        });
      }
      setTotalSoldOut(totalOut);

      // Map Inventory Reports
      const invItems: ProductReportInfo[] = (products || []).map(p => ({
        sku: p.sku,
        name: p.name,
        category: p.categories?.name || 'Uncategorized',
        current_stock: p.current_stock,
        minimum_stock_alert: p.minimum_stock_alert,
        purchase_price: p.purchase_price,
        selling_price: p.selling_price,
        stock_value: p.current_stock * p.purchase_price,
        barcode: p.barcode,
        size_stocks: p.size_stocks,
        size: p.size
      }));

      // Filter Low Stock
      const lowItems = invItems.filter(p => {
        const nameClean = (p.category || '').toLowerCase().trim();
        const isFootwear = nameClean === 'mens footwear' || nameClean === 'women footwear' || nameClean === 'winter boot' || nameClean === 'winter boots';
        if (isFootwear) {
          return p.current_stock < 7;
        }
        return p.current_stock <= p.minimum_stock_alert;
      });

      // Map Categories stats
      const catStats: CategoryReportInfo[] = categoriesList.map(c => {
        const catProds = invItems.filter(p => p.category === c.name);
        return {
          name: c.name,
          products_count: catProds.length,
          total_stock: catProds.reduce((sum, p) => sum + Number(p.current_stock || 0), 0),
          stock_value: catProds.reduce((sum, p) => sum + Number(p.stock_value || 0), 0)
        };
      });

      // Calculate Sales & Purchases totals
      const totalRevenue = sales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
      const totalCosts = purchases?.reduce((sum, p) => sum + Number(p.total_amount), 0) || 0;
      
      // Calculate Profit based on actual sale items (selling_price - purchase_price * quantity)
      // For simplified profit report, we can do: Total Sales Revenue - Estimated Cost of Goods Sold (COGS)
      // Since COGS = sum(sale_items * purchase_price), we can approximate it or query sale items.
      // Let's query sale_items joined with products to get exact COGS!
      const { data: saleItems, error: itemsErr } = await supabase
        .from('sale_items')
        .select('quantity, selling_price, products(purchase_price)');
      
      let exactCOGS = 0;
      if (!itemsErr && saleItems) {
        saleItems.forEach((item: any) => {
          const buyCost = item.products?.purchase_price || 0;
          exactCOGS += Number(buyCost || 0) * Number(item.quantity || 0);
        });
      }

      const grossProfit = totalRevenue - exactCOGS;
      const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      setInventoryReport(invItems);
      setLowStockReport(lowItems);
      setCategoryReport(catStats);
      setProfitReport({
        sales_revenue: totalRevenue,
        purchase_costs: totalCosts, // Displays cash outflow
        gross_profit: grossProfit,
        profit_margin: profitMargin
      });

      setTotalSalesCount(sales?.length || 0);
      setTotalPurchasesCount(purchases?.length || 0);

    } catch (err: any) {
      showToast(err.message || 'Error generating reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsData();
  }, []);

  // Export specific report sheet
  const handleExportExcel = async (reportType: 'inventory' | 'low_stock' | 'category' | 'profit' | 'send_warehouse' | 'replenishment_total' | 'today_sold_out_total') => {
    let wsData: any[] = [];
    let filename = '';

    if (reportType === 'replenishment_total') {
      try {
        showToast('Preparing Total Replenishment report...', 'info');

        const { data, error } = await supabase
          .from('stock_movements')
          .select('*, products(sku, name, color, categories(name))')
          .eq('type', 'IN')
          .ilike('reason', 'Bulk Replenishment%')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) {
          showToast('No replenishment history logs found to export!', 'warning');
          return;
        }

        const wsDataCat = data.map((log) => {
          const sizeVal = log.reason ? log.reason.split('Size:')[1]?.trim() || 'One Size' : 'One Size';
          const catName = log.products?.categories?.name || '';
          const articleCode = formatArticleCode(log.products?.sku || '', log.products?.color || '', sizeVal, catName);
          
          return {
            'Date & Time': new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            'Article Code': articleCode,
            'Color': log.products?.color || 'N/A',
            'Quantity': log.quantity
          };
        });

        const totalQty = data.reduce((sum, log) => sum + Number(log.quantity || 0), 0);
        wsDataCat.push({
          'Date & Time': 'Total',
          'Article Code': '',
          'Color': '',
          'Quantity': totalQty
        });

        const wb = utils.book_new();
        const ws = utils.json_to_sheet(wsDataCat);
        utils.book_append_sheet(wb, ws, 'Total Replenishments');

        // Auto-fit column widths
        const maxColWidths = Object.keys(wsDataCat[0] || {}).map((_, colIndex) => {
          return Math.max(...wsDataCat.map(row => {
            const val = Object.values(row)[colIndex];
            return val ? String(val).length : 0;
          })) + 4;
        });
        ws['!cols'] = maxColWidths.map(w => ({ wch: w }));

        filename = 'SaintG_Total_Replenishment_Report';
        const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        showToast('Total Replenishment report exported successfully!', 'success');
      } catch (err: any) {
        showToast(err.message || 'Error exporting Replenishment report', 'error');
      }
      return;
    }

    if (reportType === 'today_sold_out_total') {
      try {
        showToast('Preparing Total Sold Out report...', 'info');

        const { data, error } = await supabase
          .from('stock_movements')
          .select('*, products(sku, name, color, categories(name))')
          .eq('type', 'OUT')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) {
          showToast('No sold out history logs found to export!', 'warning');
          return;
        }

        const filteredData = (data || []).filter(log => {
          const r = (log.reason || '').toLowerCase();
          return !r.includes('send warehouse');
        });

        if (filteredData.length === 0) {
          showToast('No sold out history logs found to export!', 'warning');
          return;
        }

        const wsDataCat = filteredData.map((log) => {
          const sizeVal = log.reason ? log.reason.match(/(?:size:?\s*|size\s+)([a-z0-9]+)/i)?.[1]?.toUpperCase() || 'N/A' : 'N/A';
          const catName = log.products?.categories?.name || '';
          const articleCode = formatArticleCode(log.products?.sku || '', log.products?.color || '', sizeVal, catName);
          
          return {
            'Date & Time': new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            'Article Code': articleCode,
            'Color': log.products?.color || 'N/A',
            'Quantity': log.quantity,
            'Source / Reason': getSourceText(log.reason)
          };
        });

        const totalQty = filteredData.reduce((sum, log) => sum + Number(log.quantity || 0), 0);
        wsDataCat.push({
          'Date & Time': 'Total',
          'Article Code': '',
          'Color': '',
          'Quantity': totalQty,
          'Source / Reason': ''
        });

        const wb = utils.book_new();
        const ws = utils.json_to_sheet(wsDataCat);
        utils.book_append_sheet(wb, ws, 'Total Sold Out');

        // Auto-fit column widths
        const maxColWidths = Object.keys(wsDataCat[0] || {}).map((_, colIndex) => {
          return Math.max(...wsDataCat.map(row => {
            const val = Object.values(row)[colIndex];
            return val ? String(val).length : 0;
          })) + 4;
        });
        ws['!cols'] = maxColWidths.map(w => ({ wch: w }));

        filename = 'SaintG_Total_SoldOut_Report';
        const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        showToast('Total Sold Out report exported successfully!', 'success');
      } catch (err: any) {
        showToast(err.message || 'Error exporting Sold Out report', 'error');
      }
      return;
    }

    if (reportType === 'send_warehouse') {
      try {
        showToast('Preparing Send Warehouse report...', 'info');

        const { data: productsData, error: prodErr } = await supabase
          .from('products')
          .select('id, sku, barcode, name, color, categories(name)');
        if (prodErr) throw prodErr;
        const products = (productsData || []) as any[];

        const { data: movementsData, error: movErr } = await supabase
          .from('stock_movements')
          .select('product_id, quantity, reason')
          .eq('type', 'OUT');
        if (movErr) throw movErr;

        const movements = (movementsData || []).filter(m => {
          const r = m.reason || '';
          return r.includes('Send Warehouse | Size:') ||
                 r.includes('Warehouse Dispatch Sale (Size') ||
                 r.includes('Warehouse Dispatch Bulk Remove | Size:');
        });

        if (!movements || movements.length === 0) {
          showToast('No warehouse dispatches found to export!', 'warning');
          return;
        }

        const dispatchAgg: Record<string, Record<string, number>> = {};
        movements.forEach(m => {
          const prodId = m.product_id;
          let sizeName = 'One Size';
          const reasonStr = m.reason || '';
          
          if (reasonStr.includes('Send Warehouse | Size:')) {
            sizeName = reasonStr.split('Send Warehouse | Size:')[1].trim();
          } else if (reasonStr.includes('Warehouse Dispatch Sale (Size ')) {
            sizeName = reasonStr.replace('Warehouse Dispatch Sale (Size ', '').replace(')', '').trim();
          } else if (reasonStr.includes('Warehouse Dispatch Bulk Remove | Size:')) {
            sizeName = reasonStr.split('Warehouse Dispatch Bulk Remove | Size:')[1].trim();
          }
          
          if (!dispatchAgg[prodId]) {
            dispatchAgg[prodId] = {};
          }
          dispatchAgg[prodId][sizeName] = (dispatchAgg[prodId][sizeName] || 0) + Number(m.quantity || 0);
        });

        const wsDataCat: any[] = [];
        let grandTotalQty = 0;

        products.forEach(p => {
          const prodSent = dispatchAgg[p.id];
          if (!prodSent) return;

          Object.keys(prodSent).forEach(sz => {
            const qty = prodSent[sz];
            if (qty > 0) {
              const cleanSku = (p.sku || '').toLowerCase().trim();
              const cleanColor = (p.color || '').toLowerCase().trim();
              const skuCode = cleanColor && cleanColor !== 'n/a' && !cleanSku.endsWith(`-${cleanColor}`) && !cleanSku.endsWith(cleanColor)
                ? `${cleanSku}-${cleanColor}`
                : cleanSku;
              wsDataCat.push({
                'SKU Code': skuCode,
                'Size': sz,
                'Quantity': qty
              });
              grandTotalQty += Number(qty || 0);
            }
          });
        });

        if (wsDataCat.length === 0) {
          showToast('No warehouse dispatches found to export!', 'warning');
          return;
        }

        // Sort by SKU Code and then Size for neatness
        wsDataCat.sort((a, b) => {
          if (a['SKU Code'] !== b['SKU Code']) {
            return a['SKU Code'].localeCompare(b['SKU Code']);
          }
          return String(a['Size']).localeCompare(String(b['Size']));
        });

        // Add Total row
        wsDataCat.push({
          'SKU Code': 'Total',
          'Size': '',
          'Quantity': grandTotalQty
        });

        const wb = utils.book_new();
        const ws = utils.json_to_sheet(wsDataCat);
        utils.book_append_sheet(wb, ws, 'Warehouse Dispatches');

        // Set column widths
        ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }];

        filename = 'SaintG_SendWarehouse_Report';
        const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        showToast('Send Warehouse report exported successfully!', 'success');
      } catch (err: any) {
        showToast(err.message || 'Error exporting Send Warehouse report', 'error');
      }
      return;
    }

    if (reportType === 'inventory') {
      const wb = utils.book_new();
      const catsInReport = Array.from(new Set(inventoryReport.map(p => p.category)));

      catsInReport.forEach(catName => {
        const catProds = inventoryReport.filter(p => p.category === catName);
        const sizes = getSizePreset(catName);

        const wsDataCat = catProds.map((p, idx) => {
          const rawCode = (p.sku || p.barcode || '').trim().toUpperCase();
          const cleanCode = rawCode
            .replace(/^(SG-)+/gi, 'SG-')
            .replace(/^(SA-)+/gi, 'SA-')
            .replace(/^(SGM-)+/gi, 'SGM-')
            .replace(/-([A-Z0-9]+)-\1$/gi, '-$1');

          const row: any = {
            'SR.NO': idx + 1,
            'SKU': cleanCode,
          };

          sizes.forEach(sz => {
            const qty = Number(p.size_stocks?.[sz] ?? p.size_stocks?.[`${sz}eu`] ?? p.size_stocks?.[sz.replace('eu', '')]) || 0;
            row[sz] = qty;
          });

          row['DISPLAY'] = p.size || '';
          row['TOTAL'] = p.current_stock || 0;

          return row;
        });

        const ws = utils.json_to_sheet(wsDataCat, { header: ['SR.NO', 'SKU', ...sizes, 'DISPLAY', 'TOTAL'] });
        const tabName = catName.replace(/[\[\]\*\?:\/\\]/g, '').slice(0, 31);
        utils.book_append_sheet(wb, ws, tabName || 'Sheet');
      });

      filename = 'SaintG_Inventory_Report';
      const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      showToast('Inventory report exported successfully!', 'success');
      return;
    } else if (reportType === 'low_stock') {
      wsData = lowStockReport.map(p => ({
        SKU: p.sku,
        Name: p.name,
        Category: p.category,
        'Stock Level': p.current_stock,
        'Minimum Threshold': p.minimum_stock_alert,
        'Purchase Cost (₹)': p.purchase_price
      }));
      filename = 'SaintG_LowStock_Alerts_Report';
    } else if (reportType === 'category') {
      wsData = categoryReport.map(c => ({
        'Category Name': c.name,
        'Different Products': c.products_count,
        'Total Stock Count': c.total_stock,
        'Stock Value Asset (₹)': c.stock_value
      }));
      filename = 'SaintG_Category_Performance_Report';
    } else {
      wsData = [{
        'Total Revenue Sales (₹)': profitReport.sales_revenue,
        'Total Purchase Cash Outflow (₹)': profitReport.purchase_costs,
        'Gross Profit Earned (₹)': profitReport.gross_profit,
        'Estimated Profit Margin (%)': profitReport.profit_margin.toFixed(2) + '%'
      }];
      filename = 'SaintG_Financial_Profit_Report';
    }

    const ws = utils.json_to_sheet(wsData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Report Sheet');
    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    showToast(`${reportType.replace('_', ' ')} report exported successfully!`, 'success');
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse select-none">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          ))}
        </div>
        <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
      </div>
    );
  }

  // Calculate overall metrics
  const getCategoryStats = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return { articlesCount: 0, totalQuantity: 0 };
    
    const catProds = inventoryReport.filter(p => p.category === cat.name);
    const articlesCount = catProds.length;
    const totalQuantity = catProds.reduce((sum, p) => sum + Number(p.current_stock || 0), 0);
    return { articlesCount, totalQuantity };
  };

  const handleRemoveCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryIdToRemove) return;

    const cat = categories.find(c => c.id === selectedCategoryIdToRemove);
    if (!cat) return;

    const stats = getCategoryStats(selectedCategoryIdToRemove);
    const confirmMessage = `Are you sure you want to delete the category "${cat.name}"? It contains ${stats.articlesCount} articles and ${stats.totalQuantity} total quantity (all sizes). This will permanently delete the category and all its products from the inventory dashboard.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setRemovingCategory(true);

      // 1. Delete products in this category
      const { error: prodDeleteErr } = await supabase
        .from('products')
        .delete()
        .eq('category_id', selectedCategoryIdToRemove);
      
      if (prodDeleteErr) throw prodDeleteErr;

      // 2. Delete the category itself
      const { error: catDeleteErr } = await supabase
        .from('categories')
        .delete()
        .eq('id', selectedCategoryIdToRemove);

      if (catDeleteErr) throw catDeleteErr;

      showToast(`Category "${cat.name}" and all its products have been successfully deleted.`, 'success');
      setSelectedCategoryIdToRemove('');
      setIsRemoveCategoryModalOpen(false);
      fetchReportsData();
    } catch (err: any) {
      showToast(err.message || 'Error removing category', 'error');
    } finally {
      setRemovingCategory(false);
    }
  };

  const handleClearWarehouseHistory = async () => {
    const password = prompt('Enter the administrator password to clear all warehouse dispatch history records:');
    if (password === null) return;

    if (password !== 'Krishan@123') {
      showToast('Incorrect administrator password!', 'error');
      return;
    }

    if (!confirm('Are you sure you want to permanently delete all warehouse dispatch history (both manual dispatches and sales dispatches)? This action cannot be undone.')) {
      return;
    }

    try {
      setClearingWarehouse(true);

      // 1. Delete standard Send Warehouse movements
      const { error: err1 } = await supabase
        .from('stock_movements')
        .delete()
        .ilike('reason', 'Send Warehouse | Size:%');
      if (err1) throw err1;

      // 2. Delete Warehouse Dispatch Sales movements
      const { error: err2 } = await supabase
        .from('stock_movements')
        .delete()
        .ilike('reason', 'Warehouse Dispatch Sale (Size%');
      if (err2) throw err2;

      // 3. Delete Warehouse Dispatch Bulk Remove movements
      const { error: err3 } = await supabase
        .from('stock_movements')
        .delete()
        .ilike('reason', 'Warehouse Dispatch Bulk Remove%');
      if (err3) throw err3;

      showToast('All warehouse dispatch history has been successfully cleared!', 'success');
      fetchReportsData();
    } catch (err: any) {
      showToast(err.message || 'Error occurred during clearing warehouse history', 'error');
    } finally {
      setClearingWarehouse(false);
    }
  };
  const totalStockAssetsValue = inventoryReport.reduce((sum, p) => sum + Number(p.stock_value || 0), 0);
  const totalPhysicalStock = inventoryReport.reduce((sum, p) => sum + Number(p.current_stock || 0), 0);

  return (
    <div className="flex flex-col gap-8 select-none font-sans">
      {/* Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Audit stock value assets, profit margins, and categorised performance logs.</p>
        </div>
        <div className="flex items-center gap-3 self-stretch md:self-auto flex-wrap">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-550 active:scale-[0.98] text-white font-bold text-xs tracking-wider uppercase transition-all shadow-sm flex-1 sm:flex-none"
          >
            <Plus className="w-4.5 h-4.5" />
            Add Category
          </button>
          <button
            onClick={() => {
              setSelectedCategoryIdToRemove('');
              setIsRemoveCategoryModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-bold text-xs tracking-wider uppercase transition-all shadow-sm flex-1 sm:flex-none"
          >
            <Trash2 className="w-4.5 h-4.5" />
            Remove Category
          </button>
          <button
            onClick={handleClearWarehouseHistory}
            disabled={clearingWarehouse}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-955/30 text-rose-600 dark:text-rose-400 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all disabled:opacity-50 w-full sm:w-auto"
          >
            <Trash2 className="w-4.5 h-4.5" />
            {clearingWarehouse ? 'Clearing...' : 'Clear Warehouse History'}
          </button>
          <button
            onClick={handleSystemReset}
            disabled={resetting}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-955/30 text-rose-600 dark:text-rose-400 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all disabled:opacity-50 w-full sm:w-auto"
          >
            <Trash2 className="w-4.5 h-4.5" />
            {resetting ? 'Resetting...' : 'Reset System'}
          </button>
          <button
            onClick={fetchReportsData}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all w-full sm:w-auto"
          >
            Recalculate Data
          </button>
        </div>
      </div>

      {/* Financial Profit Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sales Card */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Sales Revenue</span>
              <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white">₹{profitReport.sales_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h3>
              <p className="text-xs text-slate-500">{totalSalesCount} invoices recorded</p>
            </div>
            <div className="w-11 h-11 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl flex items-center justify-center">
              <Coins className="w-5.5 h-5.5" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* Expenses Card */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Purchase Cash Outflow</span>
              <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white">₹{profitReport.purchase_costs.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h3>
              <p className="text-xs text-slate-500">{totalPurchasesCount} orders logged</p>
            </div>
            <div className="w-11 h-11 bg-indigo-500/10 text-indigo-550 border border-indigo-500/20 rounded-xl flex items-center justify-center">
              <ShoppingCart className="w-5.5 h-5.5" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500" />
        </div>

        {/* Profit Card */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Gross Profit</span>
              <h3 className={`text-2xl font-extrabold ${profitReport.gross_profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                ₹{profitReport.gross_profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-xs text-slate-500">Margin: <strong className="font-semibold">{profitReport.profit_margin.toFixed(1)}%</strong></p>
            </div>
            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${
              profitReport.gross_profit >= 0 
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
            }`}>
              {profitReport.gross_profit >= 0 ? <TrendingUp className="w-5.5 h-5.5" /> : <TrendingDown className="w-5.5 h-5.5" />}
            </div>
          </div>
          <div className={`absolute bottom-0 left-0 right-0 h-1 ${profitReport.gross_profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </div>
      </div>

      {/* Reports Export Panels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Inventory Assets Value Report */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-500" />
              <h3 className="font-extrabold text-base tracking-tight">Inventory Report</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Provides audit statements of current stock counts, cost values, selling structures, and aggregate catalog assets.
            </p>
            <div className="pt-2 flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
              <span>Physical Units: <strong className="text-slate-800 dark:text-slate-200">{totalPhysicalStock}</strong></span>
              <span>Asset Valuation: <strong className="text-indigo-600 dark:text-indigo-400">₹{totalStockAssetsValue.toLocaleString('en-IN')}</strong></span>
            </div>
          </div>
          <button
            onClick={() => handleExportExcel('inventory')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all"
          >
            <Download className="w-4 h-4" />
            Download Inventory Report
          </button>
        </div>

        {/* Low Stock Warning Report */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
              <h3 className="font-extrabold text-base tracking-tight">Low Stock Alerts Report</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Track products running below warning levels. Helps procurement teams determine which footwear and apparel SKUs require reorders.
            </p>
            <div className="pt-2 text-xs font-semibold text-rose-500">
              Critical items requiring order: <strong className="text-sm font-extrabold ml-1">{lowStockReport.length} items</strong>
            </div>
          </div>
          <button
            onClick={() => handleExportExcel('low_stock')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all"
          >
            <Download className="w-4 h-4" />
            Download Low Stock Report
          </button>
        </div>

        {/* Category Performance report */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              <h3 className="font-extrabold text-base tracking-tight">Category Report</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Analyzes performance variables grouped by shoes (men, women), jackets, and accessories like shades and bags.
            </p>
            <div className="pt-2 flex flex-wrap gap-2">
              {categoryReport.slice(0, 3).map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                  {c.name}: {c.total_stock} pcs
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => handleExportExcel('category')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all"
          >
            <Download className="w-4 h-4" />
            Download Category Report
          </button>
        </div>

        {/* Financial Profit Report download */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-500" />
              <h3 className="font-extrabold text-base tracking-tight">Profit Audit Report</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Consolidated cash flows statement summarizing gross margins, sales revenues, supplier costs, and net margins.
            </p>
            <div className="pt-2 text-xs font-semibold text-slate-655 dark:text-slate-400">
              Net Profit Margin: <strong className="text-emerald-500 font-extrabold text-sm ml-1">{profitReport.profit_margin.toFixed(1)}%</strong>
            </div>
          </div>
          <button
            onClick={() => handleExportExcel('profit')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all"
          >
            <Download className="w-4 h-4" />
            Download Profit Report
          </button>
        </div>

        {/* Send Warehouse Dispatch Report */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-rose-500" />
              <h3 className="font-extrabold text-base tracking-tight">Send Warehouse Report</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Track total quantities of articles sent to the warehouse. Generates category-wise size sheets showing dispatch history sums.
            </p>
            <div className="pt-2 text-xs font-semibold text-rose-500">
              Total Dispatched Pieces: <strong className="text-sm font-extrabold ml-1">{totalWarehouseSent} pcs</strong>
            </div>
          </div>
          <button
            onClick={() => handleExportExcel('send_warehouse')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all"
          >
            <Download className="w-4 h-4" />
            Download Send Warehouse Report
          </button>
        </div>

        {/* Replenishment Report Card */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-500" />
              <h3 className="font-extrabold text-base tracking-tight">Total Replenishment Report</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Consolidated logs of all inbound replenishment stock movements. Generates a history list showing replenished quantities by date and item details.
            </p>
            <div className="pt-2 text-xs font-semibold text-emerald-500">
              Total Replenished Units: <strong className="text-sm font-extrabold ml-1">{totalReplenished} pcs</strong>
            </div>
          </div>
          <button
            onClick={() => handleExportExcel('replenishment_total')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all"
          >
            <Download className="w-4 h-4" />
            Download Replenishment Report
          </button>
        </div>

        {/* Sold Out Report Card */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-rose-500" />
              <h3 className="font-extrabold text-base tracking-tight">Total Sold Out Report</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Consolidated logs of all sold out stock movements. Track customer purchases, dispatches, and sales locations.
            </p>
            <div className="pt-2 text-xs font-semibold text-rose-500">
              Total Sold Out Units: <strong className="text-sm font-extrabold ml-1">{totalSoldOut} pcs</strong>
            </div>
          </div>
          <button
            onClick={() => handleExportExcel('today_sold_out_total')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] font-bold text-xs tracking-wider uppercase transition-all"
          >
            <Download className="w-4 h-4" />
            Download Sold Out Report
          </button>
        </div>

      </div>

      {/* Add Category Modal */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Add New Category"
      >
        <form onSubmit={handleAddCategorySubmit} className="space-y-4 font-sans select-none">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Category Name *</label>
            <input
              type="text"
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Women Jacket"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingCategory}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {addingCategory ? 'Adding...' : 'Add Category'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Remove Category Modal */}
      <Modal
        isOpen={isRemoveCategoryModalOpen}
        onClose={() => setIsRemoveCategoryModalOpen(false)}
        title="Remove Category"
      >
        <form onSubmit={handleRemoveCategorySubmit} className="space-y-4 font-sans select-none">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Select Category to Remove *</label>
            <select
              value={selectedCategoryIdToRemove}
              onChange={(e) => setSelectedCategoryIdToRemove(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-150"
              required
            >
              <option value="" className="text-slate-500">-- Select Category --</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id} className="text-slate-800 dark:text-slate-900">
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {selectedCategoryIdToRemove && (() => {
            const stats = getCategoryStats(selectedCategoryIdToRemove);
            return (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs space-y-1.5 shadow-sm">
                <p className="font-bold text-sm">Category Summary:</p>
                <p>• Articles: <span className="font-extrabold text-slate-800 dark:text-white">{stats.articlesCount}</span></p>
                <p>• Total Quantity (all sizes): <span className="font-extrabold text-slate-800 dark:text-white">{stats.totalQuantity}</span></p>
                <p className="text-[11px] text-rose-500 mt-2 font-semibold leading-relaxed">⚠️ Warning: Confirming will permanently delete this category and all its articles from the inventory dashboard.</p>
              </div>
            );
          })()}

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsRemoveCategoryModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={removingCategory || !selectedCategoryIdToRemove}
              className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {removingCategory ? 'Removing...' : 'Remove Category'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
