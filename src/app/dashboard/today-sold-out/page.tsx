'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';
import Modal from '@/components/ui/modal';
import { 
  ArrowDownRight, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  Clipboard, 
  FileCheck,
  Sparkles,
  History,
  Calendar,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Zap
} from 'lucide-react';
import { read, write, utils } from 'xlsx';

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  color: string;
  selling_price: number;
  current_stock: number;
  size_stocks: Record<string, number>;
  category_id: string;
  barcode: string;
  categories?: any;
}

interface Category {
  id: string;
  name: string;
}

interface DispatchItem {
  product: Product;
  removedStocks: Record<string, number>; // Size-wise removed stock quantities
  sellingPrices?: Record<string, number>; // Size-wise selling prices
  isSale?: boolean;
}

interface StockHistoryLog {
  id: string;
  created_at: string;
  type: string;
  quantity: number;
  reason: string;
  products?: {
    sku: string;
    name: string;
    color: string;
    categories?: {
      name: string;
    } | null;
  } | null;
}

interface ExcelSaleRow {
  id: string;
  rawSku: string;
  rawDate: string;
  rawPrice: number;
  rawQty: number;
  rawSize: string;
  matchedProduct: Product | null;
  fuzzyProduct?: Product | null;
  isoDate: string;
  displayDate: string;
  parsedSize: string;
  status: 'matched' | 'unmatched';
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

const getCatName = (cat: any): string => {
  if (!cat) return 'Uncategorized';
  if (Array.isArray(cat)) {
    return cat[0]?.name || 'Uncategorized';
  }
  return cat.name || 'Uncategorized';
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

const getLocalDateString = (dateStr: string): string => {
  const dateObj = new Date(dateStr);
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  return formatter.format(dateObj).replace(/\//g, '-');
};

const getThreeDaysList = (): string[] => {
  const dates: string[] = [];
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  
  for (let i = 0; i < 3; i++) {
    const localDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    localDate.setDate(localDate.getDate() - i);
    dates.push(formatter.format(localDate).replace(/\//g, '-'));
  }
  return dates;
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

const normalizeCode = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/^(sg-?)+/gi, '')
    .replace(/drk[-_]?/gi, 'dark')
    .replace(/blk[-_]?/gi, 'black')
    .replace(/brn[-_]?/gi, 'brown')
    .replace(/wht[-_]?/gi, 'white')
    .replace(/[-_\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');
};

const stripSizeSuffix = (codeNorm: string): string => {
  const allKnownSizes = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '3xl', '4xl', 'one-size', 'free-size', 'onesize', 'freesize'];
  for (const sz of allKnownSizes) {
    const suffixes = [`-${sz}eu`, `-${sz}`, `-${sz}e`, `${sz}eu`, `${sz}` ];
    for (const suffix of suffixes) {
      if (codeNorm.endsWith(suffix)) {
        return codeNorm.slice(0, -suffix.length);
      }
    }
  }
  return codeNorm;
};

const findProductMatch = (code: string, productsCache: Product[]): Product | null => {
  const codeNorm = normalizeCode(code);
  if (!codeNorm) return null;

  const matchFunc = (c: string) => {
    return productsCache.find(p => {
      const cleanProdBarcode = normalizeCode(p.barcode);
      const cleanSkuColor = normalizeCode(`${p.sku}-${p.color}`);
      const cleanSku = normalizeCode(p.sku);

      return (
        c === cleanProdBarcode ||
        c === cleanSkuColor ||
        c === cleanSku ||
        c.includes(cleanSkuColor) ||
        c.includes(cleanSku)
      );
    });
  };

  let match = matchFunc(codeNorm);
  if (match) return match;

  const codeStripped = stripSizeSuffix(codeNorm);
  if (codeStripped !== codeNorm) {
    match = matchFunc(codeStripped);
    if (match) return match;
  }

  // Smart numeric + color fuzzy match fallback so rows turn green automatically
  const nums = codeNorm.match(/\d{3,4}/);
  if (nums) {
    const numStr = nums[0];
    const numMatch = productsCache.find(p => {
      const pClean = normalizeCode(p.sku);
      const bClean = normalizeCode(p.barcode || '');
      return pClean.includes(numStr) || bClean.includes(numStr);
    });
    if (numMatch) return numMatch;
  }

  return null;
};

const findFuzzyProductMatch = (code: string, productsCache: Product[]): Product | null => {
  const clean = (code || '').toLowerCase().trim();
  const nums = clean.match(/\d{3,4}/);
  if (!nums) return null;
  const numStr = nums[0];

  return productsCache.find(p => {
    const pClean = (p.sku || '').toLowerCase();
    const bClean = (p.barcode || '').toLowerCase();
    return pClean.includes(numStr) || bClean.includes(numStr);
  }) || null;
};

const parsePastedLine = (line: string, productsCache: Product[]) => {
  line = line.trim();
  if (!line) return null;

  // 1. Try splitting by tab (Excel format)
  let cols = line.split('\t').map(c => c.trim()).filter(c => c.length > 0);
  if (cols.length <= 1) {
    cols = line.split(/ {2,}/).map(c => c.trim()).filter(c => c.length > 0);
  }

  if (cols.length >= 5) {
    const fullBarcode = cols[0];
    const sizeVal = cols[2].replace(/eu/i, '').trim().toLowerCase();
    const qty = parseInt(cols[5]) || 1;
    const sp = parseFloat(cols[4]) || 0;

    const match = findProductMatch(fullBarcode, productsCache);
    if (match) {
      return { product: match, type: 'single' as const, size: sizeVal, qty, sp };
    }
  }

  // 2. Space separated values parsing
  const parts = line.split(/[\t ]+/).map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length === 0) return null;

  const allKnownSizes = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '3xl', '4xl', 'one size', 'free size'];
  const cleanSizeStr = (s: string) => s.toLowerCase().replace(/eu$/i, '').trim();
  const isSize = (s: string) => allKnownSizes.includes(cleanSizeStr(s));

  if (parts.length >= 3 && isSize(parts[1])) {
    const code = parts[0];
    const size = cleanSizeStr(parts[1]);
    const qty = parseInt(parts[2]) || 1;
    const match = findProductMatch(code, productsCache);
    if (match) {
      return { product: match, type: 'single' as const, size, qty, sp: 0 };
    }
  }

  if (parts.length >= 2 && isSize(parts[parts.length - 1])) {
    const size = cleanSizeStr(parts[parts.length - 1]);
    const code = parts.slice(0, parts.length - 1).join('-');
    const match = findProductMatch(code, productsCache);
    if (match) {
      return { product: match, type: 'single' as const, size, qty: 1, sp: 0 };
    }
  }

  const hyphenParts = line.split('-');
  if (hyphenParts.length >= 2) {
    const lastPart = hyphenParts[hyphenParts.length - 1].trim();
    const spaceSplit = lastPart.split(/[\t ]+/);
    const potentialSize = spaceSplit[0];
    const qty = spaceSplit.length > 1 ? (parseInt(spaceSplit[1]) || 1) : 1;

    if (isSize(potentialSize)) {
      const size = cleanSizeStr(potentialSize);
      const code = hyphenParts.slice(0, hyphenParts.length - 1).join('-');
      const match = findProductMatch(code, productsCache);
      if (match) {
        return { product: match, type: 'single' as const, size, qty, sp: 0 };
      }
    }
  }

  if (parts.length >= 2) {
    const code = parts[0];
    const qtys = parts.slice(1).map(num => parseInt(num) || 0);
    const match = findProductMatch(code, productsCache);
    if (match) {
      return { product: match, type: 'grid' as const, qtys };
    }
  }

  return null;
};

// Date Parsing Helper for Excel
const parseExcelDate = (val: any): { isoDate: string; displayDate: string; dateObj: Date } => {
  let d = new Date();
  if (val !== undefined && val !== null && val !== '') {
    if (val instanceof Date) {
      d = val;
    } else if (typeof val === 'number') {
      const dateNum = Math.round((val - (25567 + 2)) * 86400 * 1000);
      const parsed = new Date(dateNum);
      if (!isNaN(parsed.getTime())) d = parsed;
    } else if (typeof val === 'string') {
      const str = val.trim();
      const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
      if (ddmmyyyy) {
        const day = parseInt(ddmmyyyy[1], 10);
        const month = parseInt(ddmmyyyy[2], 10) - 1;
        let year = parseInt(ddmmyyyy[3], 10);
        if (year < 100) year += 2000;
        const parsed = new Date(year, month, day, 12, 0, 0);
        if (!isNaN(parsed.getTime())) d = parsed;
      } else {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
    }
  }

  if (isNaN(d.getTime())) d = new Date();

  const isoDate = d.toISOString();
  const displayDate = getLocalDateString(isoDate);
  return { isoDate, displayDate, dateObj: d };
};

// Size Extraction Helper from Excel Row
const extractSizeFromRow = (rowSizeCol: any, code: string, product: Product): string => {
  if (rowSizeCol && String(rowSizeCol).trim() && String(rowSizeCol).trim().toUpperCase() !== 'N/A') {
    return String(rowSizeCol).trim().replace(/eu$/i, '').toUpperCase();
  }

  const codeLower = (code || '').toLowerCase().trim();
  const allKnownSizes = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL'];
  for (const sz of allKnownSizes) {
    const sLower = sz.toLowerCase();
    if (
      codeLower.endsWith(`-${sLower}`) || 
      codeLower.endsWith(`-${sLower}eu`) ||
      codeLower.endsWith(` ${sLower}`) ||
      codeLower.endsWith(` ${sLower}eu`)
    ) {
      return sz;
    }
  }

  const catName = getCatName(product.categories);
  const defaultSizes = getCategorySizesByName(catName);
  return defaultSizes[0] || 'One Size';
};

export default function TodaySoldOutPage() {
  const [inputMode, setInputMode] = useState<'paste' | 'excel'>('paste');
  const [pasteInput, setPasteInput] = useState('');
  const [dispatchList, setDispatchList] = useState<DispatchItem[]>([]);
  const [unmatchedCodes, setUnmatchedCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Categories and selected category filter
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  // Cache for quick lookups on the client-side
  const [productsCache, setProductsCache] = useState<Product[]>([]);

  // Recently Confirmed Dispatches for Excel/PDF download
  const [recentlyConfirmedList, setRecentlyConfirmedList] = useState<{ sku: string; color: string; size: string; quantity: number }[]>([]);
  
  // History list
  const [historyLogs, setHistoryLogs] = useState<StockHistoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryTab, setSelectedHistoryTab] = useState<string>('');
  const [historyDates, setHistoryDates] = useState<string[]>([]);

  // Excel File Upload Modal & Parser State
  const [excelRows, setExcelRows] = useState<ExcelSaleRow[]>([]);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelFilter, setExcelFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [isImportingExcel, setIsImportingExcel] = useState(false);

  // Logic ERP Direct Sync Modal & State
  const [isLogicModalOpen, setIsLogicModalOpen] = useState(false);
  const [logicServerUrl, setLogicServerUrl] = useState('http://localhost:8080');
  const [logicUsername, setLogicUsername] = useState('admin');
  const [logicPassword, setLogicPassword] = useState('');
  const [logicSyncing, setLogicSyncing] = useState(false);

  // Missing Article Codes Warning Popup Modal
  const [missingCodesList, setMissingCodesList] = useState<string[]>([]);
  const [isMissingModalOpen, setIsMissingModalOpen] = useState(false);

  const handleLogicSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logicServerUrl || !logicUsername) {
      showToast('Please enter Logic ERP Server URL and Admin Username', 'warning');
      return;
    }

    setLogicSyncing(true);
    try {
      const res = await fetch('/api/integrations/logic-erp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: logicServerUrl,
          username: logicUsername,
          password: logicPassword
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to sync with Logic ERP');
      }

      showToast(data.message || 'Logic ERP Sync Completed Successfully!', 'success');
      setIsLogicModalOpen(false);

      if (data.missingCodes && data.missingCodes.length > 0) {
        setMissingCodesList(data.missingCodes);
        setIsMissingModalOpen(true);
      }

      const { data: prods } = await supabase.from('products').select('*, categories(id, name)');
      if (prods) setProductsCache(prods);
      await fetchHistory();
    } catch (err: any) {
      showToast(err.message || 'Error syncing with Logic ERP', 'error');
    } finally {
      setLogicSyncing(false);
    }
  };

  // Fetch all products, categories, and history on mount
  const loadData = async () => {
    try {
      setLoading(true);
      
      const { data: catData } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      setCategories(catData || []);

      const { data, error } = await supabase
        .from('products')
        .select('*, categories(id, name)');
      if (error) throw error;
      setProductsCache(data || []);
      
      await fetchHistory();
    } catch (err: any) {
      showToast(err.message || 'Error loading catalog cache', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startIso = thirtyDaysAgo.toISOString();

      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, products(sku, name, color, categories(name))')
        .eq('type', 'OUT')
        .gte('created_at', startIso)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const filteredData = (data || []).filter(log => {
        const r = (log.reason || '').toLowerCase();
        return !r.includes('send warehouse');
      });
      setHistoryLogs(filteredData);

      const uniqueDates = Array.from(new Set(filteredData.map(log => getLocalDateString(log.created_at))));
      setHistoryDates(['All Dates', ...uniqueDates]);
      if (!selectedHistoryTab) setSelectedHistoryTab('All Dates');
    } catch (err: any) {
      console.error('Error loading history logs:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setSelectedHistoryTab('All Dates');
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ky_pending_today_sold_out');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setDispatchList(parsed);
        } catch (e) {
          console.error('Error parsing pending today-sold-out list:', e);
        }
      }
      const savedConfirmed = localStorage.getItem('ky_recent_confirmed_today_sold_out');
      if (savedConfirmed) {
        try {
          setRecentlyConfirmedList(JSON.parse(savedConfirmed));
        } catch (e) {}
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ky_pending_today_sold_out', JSON.stringify(dispatchList));
    }
  }, [dispatchList]);

  const handleSelectFuzzySuggestion = (rowId: string, suggestedProd: Product) => {
    setExcelRows(prev => prev.map(r => {
      if (r.id === rowId) {
        const parsedSize = extractSizeFromRow(r.rawSize, r.rawSku, suggestedProd);
        return {
          ...r,
          matchedProduct: suggestedProd,
          status: 'matched',
          parsedSize
        };
      }
      return r;
    }));
    showToast(`Updated SKU ${suggestedProd.sku} to Matched & Ready!`, 'success');
  };

  // Handle Excel File Upload & Intelligent Column Matching (Supports SALE REGISTER DETAILED & standard sheets)
  const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = read(buffer, { type: 'array', cellDates: true });
        const firstSheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[firstSheetName];

        // Parse as 2D array to detect headers and exact column positions (e.g. SALE REGISTER DETAILED layout)
        const rawRows: any[][] = utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (rawRows.length === 0) {
          showToast('The uploaded Excel file is empty', 'warning');
          return;
        }

        let headerRowIndex = -1;
        let itemCodeCol = -1;
        let dateCol = -1;
        let priceCol = -1;
        let qtyCol = -1;
        let sizeCol = -1;

        // Scan first 25 rows for header labels
        for (let r = 0; r < Math.min(rawRows.length, 25); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').trim().toUpperCase();
            if (val.includes('ITEM CODE') || val.includes('ITEMCODE') || val === 'SKU' || val === 'ARTICLE CODE' || val === 'ARTICLE') {
              headerRowIndex = r;
              break;
            }
          }
          if (headerRowIndex !== -1) break;
        }

        if (headerRowIndex !== -1) {
          const hRow = rawRows[headerRowIndex];
          hRow.forEach((cell: any, colIdx: number) => {
            const text = String(cell || '').trim().toUpperCase();
            if (/ITEM CODE|ITEMCODE|SKU|ARTICLE|CODE|BARCODE/i.test(text)) itemCodeCol = colIdx;
            else if (/BILL DATE|SALE DATE|TRANSACTION DATE|DATE|TIME/i.test(text) && dateCol === -1) dateCol = colIdx;
            else if (/NET AMOUNT|GROSS AMOUNT|RATE\/UNIT|AMOUNT|PRICE|NET|RATE|SP/i.test(text) && priceCol === -1) priceCol = colIdx;
            else if (/TOTAL QTY|QTY|QUANTITY|UNITS|PCS|COUNT/i.test(text)) qtyCol = colIdx;
            else if (/PACK\/GRADE|PACK|GRADE|SIZE|SZ/i.test(text)) sizeCol = colIdx;
          });
        }

        // Default fallback column positions (based on SALE REGISTER report layout)
        if (itemCodeCol === -1) itemCodeCol = 1; // Column B (ITEM CODE)
        if (dateCol === -1) dateCol = 2;       // Column C (BILL DATE)
        if (priceCol === -1) priceCol = 12;     // Column M (NET AMOUNT)
        if (qtyCol === -1) qtyCol = 7;         // Column H (TOTAL QTY)
        if (sizeCol === -1) sizeCol = 6;        // Column G (PACK/GRADE)

        const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
        const parsed: ExcelSaleRow[] = [];

        for (let r = startRow; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!Array.isArray(row) || row.length === 0) continue;

          const rawSku = String(row[itemCodeCol] || '').trim();

          // Skip empty lines, title rows, headers, and "Date Totals" subtotal summary lines
          if (!rawSku) continue;
          if (/TOTAL|SNO|ITEM CODE|HEADER|SUBTOTAL|GRAND|REGISTER/i.test(rawSku)) continue;

          const rawDate = row[dateCol];
          
          // Extract price: Check detected priceCol, fallback to Net Amount (col 12 / M), Gross Amount (col 10 / K), or Rate (col 9 / J)
          let rawPrice = 0;
          if (priceCol !== -1 && row[priceCol] !== undefined && row[priceCol] !== '') {
            rawPrice = parseFloat(String(row[priceCol]).replace(/[^0-9.]/g, '')) || 0;
          }
          if (rawPrice === 0 && row[12] !== undefined) {
            rawPrice = parseFloat(String(row[12]).replace(/[^0-9.]/g, '')) || 0; // Column M
          }
          if (rawPrice === 0 && row[10] !== undefined) {
            rawPrice = parseFloat(String(row[10]).replace(/[^0-9.]/g, '')) || 0; // Column K
          }
          if (rawPrice === 0 && row[9] !== undefined) {
            rawPrice = parseFloat(String(row[9]).replace(/[^0-9.]/g, '')) || 0; // Column J
          }

          const rawQty = (qtyCol !== -1 && row[qtyCol] !== undefined && row[qtyCol] !== '') 
            ? (parseInt(String(row[qtyCol]), 10) || 1) 
            : 1;
          const rawSize = sizeCol !== -1 ? String(row[sizeCol] || '').trim() : '';

          let matched = findProductMatch(rawSku, productsCache);
          if (!matched) {
            matched = findFuzzyProductMatch(rawSku, productsCache);
          }
          const fuzzyProduct = !matched ? findFuzzyProductMatch(rawSku, productsCache) : null;
          const dateInfo = parseExcelDate(rawDate);
          const parsedSize = matched ? extractSizeFromRow(rawSize, rawSku, matched) : (rawSize || 'One Size');
          const finalPrice = rawPrice > 0 ? rawPrice : (matched?.selling_price || 0);

          parsed.push({
            id: `excel-row-${r}-${Math.random()}`,
            rawSku,
            rawDate: String(rawDate),
            rawPrice: finalPrice,
            rawQty,
            rawSize,
            matchedProduct: matched,
            fuzzyProduct,
            isoDate: dateInfo.isoDate,
            displayDate: dateInfo.displayDate,
            parsedSize,
            status: matched ? ('matched' as const) : ('unmatched' as const)
          });
        }

        if (parsed.length === 0) {
          showToast('No valid article rows found in Excel file', 'warning');
          return;
        }

        setExcelRows(parsed);
        setIsExcelModalOpen(true);
        showToast(`Parsed ${parsed.length} articles from Excel file!`, 'success');
      } catch (err: any) {
        showToast('Error reading Excel file: ' + err.message, 'error');
      } finally {
        e.target.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Import Date-Wise Sales into Supabase
  const handleImportExcelSales = async () => {
    const matched = excelRows.filter(r => r.status === 'matched' && r.matchedProduct);
    if (matched.length === 0) {
      showToast('No matched products to import', 'warning');
      return;
    }

    setIsImportingExcel(true);
    try {
      const dateGroups: Record<string, typeof matched> = {};
      matched.forEach(item => {
        const dateKey = item.displayDate;
        if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
        dateGroups[dateKey].push(item);
      });

      const confirmedBatch: typeof recentlyConfirmedList = [];

      for (const displayDate of Object.keys(dateGroups)) {
        const groupRows = dateGroups[displayDate];
        const isoDate = groupRows[0].isoDate;
        const dateTotal = groupRows.reduce((sum, r) => sum + (r.rawQty * r.rawPrice), 0);

        // 1. Insert into sales table with date from Excel
        const { data: saleData, error: saleErr } = await supabase
          .from('sales')
          .insert({
            sale_date: isoDate,
            total_amount: dateTotal
          })
          .select()
          .single();
        if (saleErr) throw saleErr;

        // 2. Insert items into sale_items table
        for (const item of groupRows) {
          const prod = item.matchedProduct!;
          const { error: itemErr } = await supabase
            .from('sale_items')
            .insert({
              sale_id: saleData.id,
              product_id: prod.id,
              size: item.parsedSize,
              quantity: item.rawQty,
              selling_price: item.rawPrice
            });
          if (itemErr) throw itemErr;

          // Rename trigger movement reason for clarity in history log
          const { data: movementData } = await supabase
            .from('stock_movements')
            .select('id')
            .eq('product_id', prod.id)
            .eq('type', 'OUT')
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (movementData && movementData.length > 0) {
            await supabase
              .from('stock_movements')
              .update({ reason: `Date-Wise Excel Import Sale (Date: ${displayDate} | Size ${item.parsedSize})` })
              .eq('id', movementData[0].id);
          }

          confirmedBatch.push({
            sku: prod.sku,
            color: prod.color,
            size: item.parsedSize,
            quantity: item.rawQty
          });
        }
      }

      setRecentlyConfirmedList(prev => [...confirmedBatch, ...prev]);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ky_recent_confirmed_today_sold_out', JSON.stringify([...confirmedBatch, ...recentlyConfirmedList]));
      }

      showToast(`Successfully added date-wise sales for ${matched.length} items across ${Object.keys(dateGroups).length} dates!`, 'success');
      setIsExcelModalOpen(false);
      setExcelRows([]);

      // Reload products cache and history logs
      const { data } = await supabase.from('products').select('*, categories(id, name)');
      if (data) setProductsCache(data);
      await fetchHistory();
    } catch (err: any) {
      showToast(err.message || 'Error importing date-wise sales', 'error');
    } finally {
      setIsImportingExcel(false);
    }
  };

  const downloadSampleExcel = () => {
    const sampleData = [
      {
        'SKU Code': 'SG-F-1893-BROWN-38EU',
        'Date': '05-08-2026',
        'Price': 10500,
        'Quantity': 1,
        'Size': '38'
      },
      {
        'SKU Code': 'SGM-1200-BLACK-42EU',
        'Date': '06-08-2026',
        'Price': 8500,
        'Quantity': 2,
        'Size': '42'
      }
    ];

    const ws = utils.json_to_sheet(sampleData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Sales Sample');
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];

    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sales_Import_Sample_Template.xlsx`;
    a.click();
    showToast('Downloaded sample Excel template', 'success');
  };

  const handleLoadArticles = () => {
    if (!selectedCategoryId) {
      showToast('Please select a category first', 'warning');
      return;
    }

    if (!pasteInput.trim()) {
      showToast('Please paste or enter some article codes first', 'warning');
      return;
    }

    const lines = pasteInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const uniqueLines = Array.from(new Set(lines));

    const newDispatchItems: DispatchItem[] = [...dispatchList];
    const failedCodes: string[] = [];

    for (const line of uniqueLines) {
      const parsed = parsePastedLine(line, productsCache);

      if (parsed) {
        const { product: match, type, size, qty, qtys, sp } = parsed;

        if (match.category_id !== selectedCategoryId) {
          failedCodes.push(line);
          continue;
        }

        const catName = getCatName(match.categories);
        const defaultSizes = getCategorySizesByName(catName);

        const sizeStocksInput: Record<string, number> = {};
        const sizeSellingPrices: Record<string, number> = {};
        defaultSizes.forEach(sz => {
          sizeStocksInput[sz] = 0;
          sizeSellingPrices[sz] = 0;
        });

        const isSale = type === 'single' && (sp || 0) > 0;

        if (type === 'single' && size) {
          const matchedSize = defaultSizes.find(sz => sz.toLowerCase() === size.toLowerCase()) || defaultSizes[0];
          const availableStock = match.size_stocks?.[matchedSize] || 0;
          const targetQty = qty || 1;

          if (isSale) {
            sizeStocksInput[matchedSize] = targetQty;
            if (sp && sp > 0) sizeSellingPrices[matchedSize] = sp;
          } else {
            if (targetQty > availableStock) {
              sizeStocksInput[matchedSize] = availableStock;
              showToast(`Warning: SKU ${match.sku} size ${matchedSize} capped at available stock level (${availableStock}).`, 'warning');
            } else {
              sizeStocksInput[matchedSize] = targetQty;
            }
          }
        } else if (type === 'grid' && qtys) {
          let sizesToMap = [...defaultSizes];
          if (catName === 'Women Footwear') {
            sizesToMap = ['36', '37', '38', '39', '40', '41'];
          }

          sizesToMap.forEach((sz, idx) => {
            if (idx < qtys.length) {
              const availableStock = match.size_stocks?.[sz] || 0;
              const requested = qtys[idx];

              if (requested > availableStock) {
                sizeStocksInput[sz] = availableStock;
                showToast(`Warning: SKU ${match.sku} size ${sz} capped at available stock level (${availableStock}).`, 'warning');
              } else {
                sizeStocksInput[sz] = requested;
              }
            }
          });
        }

        const existingIdx = newDispatchItems.findIndex(item => item.product.id === match.id);
        if (existingIdx > -1) {
          Object.keys(sizeStocksInput).forEach(sz => {
            newDispatchItems[existingIdx].removedStocks[sz] = (newDispatchItems[existingIdx].removedStocks[sz] || 0) + sizeStocksInput[sz];
            if (isSale && sizeSellingPrices[sz] > 0) {
              if (!newDispatchItems[existingIdx].sellingPrices) newDispatchItems[existingIdx].sellingPrices = {};
              newDispatchItems[existingIdx].sellingPrices[sz] = sizeSellingPrices[sz];
            }
          });
          if (isSale) {
            newDispatchItems[existingIdx].isSale = true;
          }
        } else {
          newDispatchItems.push({
            product: match,
            removedStocks: sizeStocksInput,
            sellingPrices: sizeSellingPrices,
            isSale
          });
        }
      } else {
        failedCodes.push(line);
      }
    }

    if (newDispatchItems.length === 0) {
      setUnmatchedCodes(failedCodes);
      setPasteInput('');
      showToast('No articles could be parsed.', 'warning');
      return;
    }

    const parsedSummary = newDispatchItems.map(item => {
      const removedSizes = Object.keys(item.removedStocks).filter(sz => item.removedStocks[sz] > 0);
      const sizesStr = removedSizes.map(sz => `Size ${sz} (-${item.removedStocks[sz]} units)`).join(', ');
      return `- SKU ${item.product.sku} (${item.product.color || 'N/A'}): ${sizesStr || 'No sizes specified'}`;
    }).join('\n');

    if (!confirm(`Are you sure you want to load the following parsed articles to the pending list?\n\n${parsedSummary}`)) {
      return;
    }

    setDispatchList(newDispatchItems);
    setUnmatchedCodes(failedCodes);
    setPasteInput('');
    showToast(`Successfully loaded articles to pending list!`, 'success');
  };

  const handleSizeQtyChange = (productId: string, size: string, value: number) => {
    setDispatchList(prev => 
      prev.map(item => {
        if (item.product.id === productId) {
          const availableStock = item.product.size_stocks?.[size] || 0;
          let safeValue = Math.max(0, value);
          
          if (!item.isSale) {
            safeValue = Math.min(availableStock, safeValue);
            if (value > availableStock) {
              showToast(`Cannot dispatch more than available stock (${availableStock}) for size ${size}`, 'warning');
            }
          }

          return {
            ...item,
            removedStocks: {
              ...item.removedStocks,
              [size]: safeValue
            }
          };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (productId: string) => {
    setDispatchList(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleClearAll = () => {
    if (confirm('Clear the dispatch list?')) {
      setDispatchList([]);
      setUnmatchedCodes([]);
    }
  };

  const handleConfirmDispatch = async () => {
    if (dispatchList.length === 0) {
      showToast('No articles in the dispatch list', 'warning');
      return;
    }

    let totalRemovedQty = 0;
    dispatchList.forEach(item => {
      totalRemovedQty += Object.values(item.removedStocks).reduce((sum, q) => sum + Number(q || 0), 0);
    });

    if (totalRemovedQty === 0) {
      showToast('Please enter dispatch quantities for at least one article size', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const saleItemsList: { product: Product; size: string; qty: number; sp: number }[] = [];
      const regularDispatchList: DispatchItem[] = [];

      dispatchList.forEach(item => {
        if (item.isSale) {
          Object.keys(item.removedStocks).forEach(sz => {
            const qty = item.removedStocks[sz];
            const sp = item.sellingPrices?.[sz] || 0;
            if (qty > 0) {
              saleItemsList.push({
                product: item.product,
                size: sz,
                qty,
                sp
              });
            }
          });
        } else {
          regularDispatchList.push(item);
        }
      });

      if (saleItemsList.length > 0) {
        const totalSalesVal = saleItemsList.reduce((sum, item) => sum + (item.qty * item.sp), 0);

        const { data: saleData, error: saleErr } = await supabase
          .from('sales')
          .insert({ total_amount: totalSalesVal })
          .select()
          .single();
        if (saleErr) throw saleErr;

        for (const sItem of saleItemsList) {
          const { error: itemErr } = await supabase
            .from('sale_items')
            .insert({
              sale_id: saleData.id,
              product_id: sItem.product.id,
              size: sItem.size,
              quantity: sItem.qty,
              selling_price: sItem.sp
            });
          if (itemErr) throw itemErr;

          const { data: movementData } = await supabase
            .from('stock_movements')
            .select('id')
            .eq('product_id', sItem.product.id)
            .eq('type', 'OUT')
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (movementData && movementData.length > 0) {
            await supabase
              .from('stock_movements')
              .update({ reason: `Warehouse Dispatch Sale (Size ${sItem.size})` })
              .eq('id', movementData[0].id);
          }
        }
      }

      if (regularDispatchList.length > 0) {
        for (const item of regularDispatchList) {
          const prod = item.product;
          const removedQty = Object.values(item.removedStocks).reduce((sum, q) => sum + Number(q || 0), 0);
          
          if (removedQty > 0) {
            const updatedSizeStocks = { ...prod.size_stocks };
            Object.keys(item.removedStocks).forEach(sz => {
              const currentVal = Number(updatedSizeStocks[sz]) || 0;
              updatedSizeStocks[sz] = Math.max(0, currentVal - item.removedStocks[sz]);
            });
            const newTotalStock = Math.max(0, prod.current_stock - removedQty);

            const { error: updateErr } = await supabase
              .from('products')
              .update({
                size_stocks: updatedSizeStocks,
                current_stock: newTotalStock
              })
              .eq('id', prod.id);
            if (updateErr) throw updateErr;

            for (const sz of Object.keys(item.removedStocks)) {
              const qty = item.removedStocks[sz];
              if (qty > 0) {
                const { error: moveErr } = await supabase
                  .from('stock_movements')
                  .insert({
                    product_id: prod.id,
                    type: 'OUT',
                    quantity: qty,
                    reason: `Warehouse Dispatch Bulk Remove | Size: ${sz}`
                  });
                if (moveErr) throw moveErr;
              }
            }

            const detailsMsg = `Dispatched ${removedQty} units to Warehouse for SKU ${prod.sku} (${prod.color || 'N/A'}). Remaining stock: ${newTotalStock}`;
            await supabase.from('activity_logs').insert({
              action: 'STOCK_REMOVED',
              details: detailsMsg
            });
          }
        }
      }

      const confirmedBatch: typeof recentlyConfirmedList = [];
      dispatchList.forEach(item => {
        Object.keys(item.removedStocks).forEach(sz => {
          const qty = item.removedStocks[sz];
          if (qty > 0) {
            confirmedBatch.push({
              sku: item.product.sku,
              color: item.product.color,
              size: sz,
              quantity: qty
            });
          }
        });
      });
      setRecentlyConfirmedList(confirmedBatch);

      if (typeof window !== 'undefined') {
        localStorage.setItem('ky_recent_confirmed_today_sold_out', JSON.stringify(confirmedBatch));
        localStorage.removeItem('ky_pending_today_sold_out');
      }

      showToast(`Stock removed successfully! Logged ${totalRemovedQty} units.`, 'success');
      setDispatchList([]);
      setUnmatchedCodes([]);
      
      const { data } = await supabase.from('products').select('*, categories(id, name)');
      if (data) setProductsCache(data);
      await fetchHistory();
    } catch (err: any) {
      showToast(err.message || 'Error updating stock levels', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportConfirmedExcel = () => {
    if (recentlyConfirmedList.length === 0) {
      showToast('No recently confirmed dispatches to export', 'warning');
      return;
    }

    const wsData = recentlyConfirmedList.map((item) => {
      const cleanSku = (item.sku || '').toLowerCase().trim();
      const cleanColor = (item.color || '').toLowerCase().trim();
      const skuCode = cleanColor && cleanColor !== 'n/a' && !cleanSku.endsWith(`-${cleanColor}`) && !cleanSku.endsWith(cleanColor)
        ? `${cleanSku}-${cleanColor}`
        : cleanSku;
      return {
        'SKU Code': skuCode,
        'Size': item.size,
        'Quantity': item.quantity
      };
    });

    const totalQty = recentlyConfirmedList.reduce((sum, item) => sum + item.quantity, 0);
    wsData.push({
      'SKU Code': 'Total',
      'Size': '',
      'Quantity': totalQty
    });

    const ws = utils.json_to_sheet(wsData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Confirmed Removals');

    ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }];

    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `KY_Confirmed_Removals_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    showToast('Exported confirmed removals successfully!', 'success');
  };

  const handlePrintConfirmedPdf = () => {
    if (recentlyConfirmedList.length === 0) {
      showToast('No recently confirmed dispatches to export', 'warning');
      return;
    }

    const htmlRows = recentlyConfirmedList.map((item) => {
      const cleanSku = (item.sku || '').toLowerCase().trim();
      const cleanColor = (item.color || '').toLowerCase().trim();
      const skuCode = cleanColor && cleanColor !== 'n/a' && !cleanSku.endsWith(`-${cleanColor}`) && !cleanSku.endsWith(cleanColor)
        ? `${cleanSku}-${cleanColor}`
        : cleanSku;
      return `
        <tr>
          <td>${skuCode}</td>
          <td>${item.size}</td>
          <td style="text-align: center; font-weight: bold;">${item.quantity}</td>
        </tr>
      `;
    }).join('');

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.write(`
        <html>
          <head>
            <title>Confirmed Removed Articles Report</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              header { display: flex; justify-content: space-between; border-bottom: 2px solid #e11d48; padding-bottom: 10px; margin-bottom: 20px; }
              h1 { font-size: 20px; margin: 0; color: #1e1b4b; }
              span.date { font-size: 11px; color: #666; font-weight: bold; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 11px; }
              th { background-color: #f8fafc; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
              tr:nth-child(even) { background-color: #f8fafc; }
              .total-row { font-weight: bold; background-color: #fff1f2 !important; color: #e11d48; }
              footer { margin-top: 40px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            </style>
          </head>
          <body>
            <header>
              <div>
                <h1>KY Footwear & Apparel</h1>
                <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">Confirmed Removed Articles (Today Sold Out)</p>
              </div>
              <div style="text-align: right;">
                <span class="date">Report generated: ${new Date().toLocaleString('en-IN')}</span>
              </div>
            </header>
            <table>
              <thead>
                <tr>
                  <th>SKU Code</th>
                  <th>Size</th>
                  <th style="text-align: center;">Quantity</th>
                </tr>
              </thead>
              <tbody>
                ${htmlRows}
                <tr class="total-row">
                  <td colspan="2" style="text-align: right;">Grand Total Confirmed Removed:</td>
                  <td style="text-align: center; font-weight: 900; font-size: 13px;">${recentlyConfirmedList.reduce((sum, item) => sum + item.quantity, 0)}</td>
                </tr>
              </tbody>
            </table>
            <footer>
              KY Inventory Operations System. Confirmed checkout report.
            </footer>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(() => {
                  window.frameElement.remove();
                }, 100);
              }
            </script>
          </body>
        </html>
      `);
      doc.close();
    }
  };

  const handleExportHistoryExcel = (dateTab: string) => {
    const filteredLogs = historyLogs.filter(log => getLocalDateString(log.created_at) === dateTab);
    if (filteredLogs.length === 0) {
      showToast(`No history logs found for ${dateTab} to export`, 'warning');
      return;
    }

    const wsData = filteredLogs.map((log) => {
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

    const totalQty = filteredLogs.reduce((sum, log) => sum + Number(log.quantity || 0), 0);
    wsData.push({
      'Date & Time': 'Total',
      'Article Code': '',
      'Color': '',
      'Quantity': totalQty,
      'Source / Reason': ''
    });

    const ws = utils.json_to_sheet(wsData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Sold Out History');

    ws['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 25 }];

    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Today_Sold_Out_History_${dateTab}.xlsx`;
    a.click();
    showToast(`Exported sold out history Excel for ${dateTab} successfully!`, 'success');
  };

  const handlePrintHistoryPdf = (dateTab: string) => {
    const filteredLogs = historyLogs.filter(log => getLocalDateString(log.created_at) === dateTab);
    if (filteredLogs.length === 0) {
      showToast(`No history logs found for ${dateTab} to export`, 'warning');
      return;
    }

    const htmlRows = filteredLogs.map((log) => {
      const sizeVal = log.reason ? log.reason.match(/(?:size:?\s*|size\s+)([a-z0-9]+)/i)?.[1]?.toUpperCase() || 'N/A' : 'N/A';
      const catName = log.products?.categories?.name || '';
      const articleCode = formatArticleCode(log.products?.sku || '', log.products?.color || '', sizeVal, catName);
      return `
        <tr>
          <td>${new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
          <td style="font-family: monospace; font-weight: bold; color: #e11d48;">${articleCode}</td>
          <td>${log.products?.color || 'N/A'}</td>
          <td style="text-align: center; font-weight: bold;">${log.quantity}</td>
          <td>${getSourceText(log.reason)}</td>
        </tr>
      `;
    }).join('');

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.write(`
        <html>
          <head>
            <title>Sold Out History Report - ${dateTab}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              header { display: flex; justify-content: space-between; border-bottom: 2px solid #e11d48; padding-bottom: 10px; margin-bottom: 20px; }
              h1 { font-size: 20px; margin: 0; color: #1e1b4b; }
              span.date { font-size: 11px; color: #666; font-weight: bold; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 11px; }
              th { background-color: #f8fafc; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
              tr:nth-child(even) { background-color: #f8fafc; }
              .total-row { font-weight: bold; background-color: #fff1f2 !important; color: #e11d48; }
              footer { margin-top: 40px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            </style>
          </head>
          <body>
            <header>
              <div>
                <h1>Sold Out History Report</h1>
                <span class="date">Date: ${dateTab}</span>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 14px; font-weight: bold; color: #e11d48;">Saint G Inventory</span>
              </div>
            </header>
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Article Code</th>
                  <th>Color</th>
                  <th style="text-align: center;">Quantity</th>
                  <th>Source / Reason</th>
                </tr>
              </thead>
              <tbody>
                ${htmlRows}
                <tr class="total-row">
                  <td colspan="3" style="text-align: right;">Grand Total Confirmed Removed:</td>
                  <td style="text-align: center; font-weight: 900; font-size: 13px;">${filteredLogs.reduce((sum, log) => sum + Number(log.quantity || 0), 0)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <footer>
              <p>Generated automatically by Saint G Inventory Management System.</p>
            </footer>
          </body>
        </html>
      `);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }
  };

  // Modal computed variables
  const matchedCount = excelRows.filter(r => r.status === 'matched').length;
  const unmatchedCount = excelRows.filter(r => r.status === 'unmatched').length;
  const totalExcelSalesVal = excelRows.filter(r => r.status === 'matched').reduce((sum, r) => sum + (r.rawQty * r.rawPrice), 0);
  const uniqueDatesCount = new Set(excelRows.filter(r => r.status === 'matched').map(r => r.displayDate)).size;

  const displayedExcelRows = excelRows.filter(r => {
    if (excelFilter === 'matched') return r.status === 'matched';
    if (excelFilter === 'unmatched') return r.status === 'unmatched';
    return true;
  });

  return (
    <div className="flex flex-col gap-6 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-850 dark:text-white flex items-center gap-2">
            <ArrowDownRight className="w-8 h-8 text-rose-500 bg-rose-500/10 p-1 rounded-xl animate-pulse" />
            Today Sold Out
          </h1>
          <p className="text-sm text-slate-500 mt-1">Daily sales dispatch records (sold out articles) by pasting text rows, uploading Excel files, or direct Logic ERP sync.</p>
        </div>

        <button
          onClick={() => setIsLogicModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
          <span>Connect Logic ERP</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Mode Selection & Input */}
        <div className="lg:col-span-1 flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          
          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setInputMode('paste')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                inputMode === 'paste'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Paste Articles</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode('excel')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                inputMode === 'excel'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Upload Excel</span>
            </button>
          </div>

          {inputMode === 'paste' ? (
            <>
              <div>
                <h2 className="font-extrabold text-base text-slate-850 dark:text-white">Paste Article Codes</h2>
                <p className="text-xs text-slate-400 mt-0.5">Format: paste standard Excel/tab-separated rows with size, MRP, SP, and quantity columns, or standard grid quantities.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 block">Select Category (Required)</label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer text-slate-700 dark:text-slate-200"
                >
                  <option value="">-- Select Category --</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id} className="dark:bg-slate-900">{cat.name}</option>
                  ))}
                </select>
              </div>

              <textarea
                className="w-full h-52 p-3 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none placeholder:text-slate-400"
                placeholder="e.g. paste Excel row:&#10;SG-F-1893-BROWN-38EU	BROWN	38	12900	10500	1"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
              />

              <button
                onClick={handleLoadArticles}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {loading ? <RefreshCw className="w-4.5 h-4.5 animate-spin" /> : <Clipboard className="w-4.5 h-4.5" />}
                Remove Article
              </button>

              {unmatchedCodes.length > 0 && (
                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-500 space-y-2 animate-fade-in">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                    <AlertCircle className="w-4.5 h-4.5 text-amber-550" />
                    <span>Unmatched/Filtered Lines ({unmatchedCodes.length})</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto text-xs font-mono bg-slate-950/20 p-2 rounded-lg leading-relaxed">
                    {unmatchedCodes.map((code, idx) => (
                      <div key={idx}>{code}</div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400">These lines could not be matched. Make sure the codes exist and belong to the selected category restriction filter if active.</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4 py-2">
              <div>
                <h2 className="font-extrabold text-base text-slate-850 dark:text-white">Upload Date-Wise Sales Excel</h2>
                <p className="text-xs text-slate-400 mt-0.5">Upload an Excel file (.xlsx, .xls, .csv). The system reads SKU Code, Date, Price & Quantity and registers date-wise sales automatically.</p>
              </div>

              <div className="border-2 border-dashed border-rose-500/30 dark:border-rose-500/20 hover:border-rose-500 bg-rose-500/5 p-6 rounded-2xl text-center space-y-3 transition-all cursor-pointer relative group">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleExcelFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                />
                <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Click or Drag Excel Sales File</p>
                  <p className="text-[10px] text-slate-400 mt-1">Supports .xlsx, .xls, .csv formats</p>
                </div>
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5 text-rose-500" /> Auto-reads SKU, Date & Price</span>
                <button
                  type="button"
                  onClick={downloadSampleExcel}
                  className="text-rose-600 dark:text-rose-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Sample Template
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Dispatch Grid Table */}
        <div className="lg:col-span-2 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
          <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-850">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <h2 className="font-extrabold text-base tracking-tight text-slate-850 dark:text-white">Dispatch List</h2>
            </div>
            {dispatchList.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                Clear List
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]">
            {dispatchList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-6 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 border border-slate-250/50 dark:border-slate-850">
                  <ArrowDownRight className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-bold text-slate-700 dark:text-slate-300 text-sm">List is Empty</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">Paste Excel rows or article codes on the left, or upload a Date-Wise Sales Excel file to populate your sold out records.</p>
              </div>
            ) : (
              dispatchList.map((item) => {
                const prod = item.product;
                const catName = getCatName(prod.categories);
                const sizes = getCategorySizesByName(catName);
                const totalItemRemoved = Object.values(item.removedStocks).reduce((sum, q) => sum + Number(q || 0), 0);

                return (
                  <div key={prod.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-rose-600 dark:text-rose-400 bg-rose-50/5 border border-rose-500/10 px-2 py-0.5 rounded">
                            {prod.sku}
                          </span>
                          <span className="text-xs font-bold text-slate-500">{prod.color}</span>
                          {item.isSale && (
                            <span className="text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                              Sale Registered
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-slate-850 dark:text-slate-100 mt-1">{prod.name || 'Unnamed Article'}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Category: {catName} | Current Stock: {prod.current_stock}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(prod.id)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-95 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Size Inputs Grid */}
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-2 border-t border-slate-200/40 dark:border-slate-800/40">
                      {sizes.map((sz) => {
                        const available = prod.size_stocks?.[sz] || 0;
                        const sp = item.sellingPrices?.[sz] || 0;
                        return (
                          <div key={sz} className="flex flex-col items-center p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-center">
                            <span className="text-[9px] font-bold text-slate-400">Sz {sz} (Avl {available})</span>
                            <input
                              type="number"
                              min="0"
                              max={item.isSale ? undefined : available}
                              className="w-full text-center bg-transparent border-none p-0 focus:ring-0 font-extrabold text-xs text-rose-500 dark:text-rose-400 mt-0.5"
                              value={item.removedStocks[sz] || ''}
                              onChange={(e) => handleSizeQtyChange(prod.id, sz, parseInt(e.target.value) || 0)}
                            />
                            {sp > 0 && item.removedStocks[sz] > 0 && (
                              <span className="text-[8px] font-semibold text-emerald-500 mt-0.5 font-mono">₹{sp}</span>
                            )}
                          </div>
                        );
                      })}

                      {/* Item Total */}
                      <div className="flex flex-col items-center justify-center p-1.5 rounded bg-rose-500/5 border border-rose-500/10 text-center">
                        <span className="text-[9px] font-bold text-rose-500">Dispatch</span>
                        <span className="font-extrabold text-xs text-rose-600 dark:text-rose-400 mt-0.5">-{totalItemRemoved}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {dispatchList.length > 0 && (
            <div className="p-5 border-t border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grand Total Pieces:</span>
                <span className="text-base font-extrabold text-rose-600 dark:text-rose-400 bg-rose-50/50 border border-rose-500/20 px-3 py-1 rounded-xl">
                  {dispatchList.reduce((sum, item) => sum + Object.values(item.removedStocks).reduce((s, q) => s + Number(q || 0), 0), 0)}
                </span>
              </div>
              <button
                onClick={handleConfirmDispatch}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                Confirm Dispatch
              </button>
            </div>
          )}
        </div>

      </div>

      {/* History Log Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-rose-500" />
            <h2 className="font-extrabold text-base tracking-tight text-slate-850 dark:text-white">Recent Today Sold Out History</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportHistoryExcel(selectedHistoryTab)}
              disabled={historyLogs.filter(log => getLocalDateString(log.created_at) === selectedHistoryTab).length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button
              onClick={() => handlePrintHistoryPdf(selectedHistoryTab)}
              disabled={historyLogs.filter(log => getLocalDateString(log.created_at) === selectedHistoryTab).length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <span>PDF</span>
            </button>
            <button 
              onClick={fetchHistory}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-all active:scale-95 cursor-pointer"
              title="Refresh History"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date tabs selector */}
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-850 pb-2 overflow-x-auto">
          {historyDates.map((dateTab) => {
            const isSelected = selectedHistoryTab === dateTab;
            const logCount = dateTab === 'All Dates' 
              ? historyLogs.length 
              : historyLogs.filter(log => getLocalDateString(log.created_at) === dateTab).length;
            
            return (
              <button
                key={dateTab}
                onClick={() => setSelectedHistoryTab(dateTab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {dateTab} ({logCount})
              </button>
            );
          })}
        </div>

        {historyLoading && historyLogs.filter(log => selectedHistoryTab === 'All Dates' || getLocalDateString(log.created_at) === selectedHistoryTab).length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading history audit logs...</div>
        ) : historyLogs.filter(log => selectedHistoryTab === 'All Dates' || getLocalDateString(log.created_at) === selectedHistoryTab).length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">No sold out dispatches recorded on {selectedHistoryTab}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Article Code</th>
                  <th className="py-3 px-4">Article Details</th>
                  <th className="py-3 px-4 text-center">Quantity</th>
                  <th className="py-3 px-4">Source / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {historyLogs
                  .filter(log => selectedHistoryTab === 'All Dates' || getLocalDateString(log.created_at) === selectedHistoryTab)
                  .map((log) => {
                    const sizeVal = log.reason ? log.reason.match(/(?:size:?\s*|size\s+)([a-z0-9]+)/i)?.[1]?.toUpperCase() || 'N/A' : 'N/A';
                    const catName = log.products?.categories?.name || '';
                    const articleCode = formatArticleCode(log.products?.sku || '', log.products?.color || '', sizeVal, catName);
                    
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/10">
                        <td className="py-3 px-4 text-slate-500 font-medium">
                          {new Date(log.created_at).toLocaleString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-rose-600 dark:text-rose-400">
                          {articleCode}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{log.products?.name || 'Unnamed'}</div>
                          <div className="text-[10px] text-slate-400 font-medium">Color: {log.products?.color || 'N/A'}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            -{log.quantity}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-medium">{getSourceText(log.reason)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recently Confirmed Section */}
      {recentlyConfirmedList.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <h2 className="font-extrabold text-base tracking-tight text-slate-855 dark:text-white">Recently Confirmed Removals (Ready to Download)</h2>
              <p className="text-xs text-slate-500">Exactly what was removed during your last confirmation. Download Excel or PDF report below.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportConfirmedExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-550 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm font-sans"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Excel</span>
              </button>
              <button
                onClick={handlePrintConfirmedPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-550 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm font-sans"
              >
                <span>Download PDF</span>
              </button>
              <button
                onClick={() => {
                  if (confirm('Clear recently confirmed session list?')) {
                    setRecentlyConfirmedList([]);
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('ky_recent_confirmed_today_sold_out');
                    }
                  }
                }}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-95 cursor-pointer"
                title="Clear Session List"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 dark:border-slate-850 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/40 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-850">
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4">Color</th>
                  <th className="py-2.5 px-4">Size</th>
                  <th className="py-2.5 px-4 text-center">Removed Qty</th>
                  <th className="py-2.5 px-4">Formatted Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {recentlyConfirmedList.map((item, idx) => {
                  const cleanSku = (item.sku || '').toLowerCase().trim();
                  const cleanColor = (item.color || '').toLowerCase().trim();
                  const skuCode = cleanColor && cleanColor !== 'n/a' && !cleanSku.endsWith(`-${cleanColor}`) && !cleanSku.endsWith(cleanColor)
                    ? `${cleanSku}-${cleanColor}`
                    : cleanSku;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/20 dark:hover:bg-slate-850/5">
                      <td className="py-2 px-4 font-mono font-bold text-rose-600 dark:text-rose-400">{item.sku}</td>
                      <td className="py-2 px-4 font-semibold text-slate-700 dark:text-slate-300">{item.color || 'N/A'}</td>
                      <td className="py-2 px-4 font-bold">Size {item.size}</td>
                      <td className="py-2 px-4 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded-md font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          -{item.quantity}
                        </span>
                      </td>
                      <td className="py-2 px-4 font-mono text-slate-500 text-[11px]">{skuCode}</td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50/50 dark:bg-slate-950/20 font-bold border-t border-slate-200 dark:border-slate-800">
                  <td colSpan={3} className="py-3 px-4 text-right text-slate-500 uppercase tracking-wider">Grand Total Sum:</td>
                  <td className="py-3 px-4 text-center text-rose-600 dark:text-rose-400 text-sm font-extrabold">
                    {recentlyConfirmedList.reduce((sum, item) => sum + item.quantity, 0)}
                  </td>
                  <td className="py-3 px-4"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Excel Date-Wise Sales Preview Modal */}
      <Modal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        title="Date-Wise Excel Sales Preview & Import"
      >
        <div className="space-y-4">
          {/* Metrics summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Rows</span>
              <p className="text-base font-extrabold text-slate-800 dark:text-white">{excelRows.length}</p>
            </div>
            <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
              <span className="text-[10px] font-bold uppercase text-emerald-600">Matched SKUs</span>
              <p className="text-base font-extrabold text-emerald-600">{matchedCount}</p>
            </div>
            <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/20">
              <span className="text-[10px] font-bold uppercase text-amber-600">Unmatched</span>
              <p className="text-base font-extrabold text-amber-600">{unmatchedCount}</p>
            </div>
            <div className="p-3 bg-rose-500/5 rounded-xl border border-rose-500/20">
              <span className="text-[10px] font-bold uppercase text-rose-600">Total Sales Value</span>
              <p className="text-base font-extrabold text-rose-600 font-mono">₹{totalExcelSalesVal.toLocaleString('en-IN')}</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setExcelFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${excelFilter === 'all' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                All ({excelRows.length})
              </button>
              <button
                type="button"
                onClick={() => setExcelFilter('matched')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${excelFilter === 'matched' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                Matched ({matchedCount})
              </button>
              <button
                type="button"
                onClick={() => setExcelFilter('unmatched')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${excelFilter === 'unmatched' ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30'}`}
              >
                ⚠️ Skipped / Unmatched ({unmatchedCount})
              </button>
            </div>

            <span className="text-[11px] font-semibold text-slate-400">
              {uniqueDatesCount} unique dates detected
            </span>
          </div>

          {/* Highlighted Skipped Articles Warning Banner */}
          {unmatchedCount > 0 && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 space-y-1.5 animate-fade-in">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs font-extrabold">
                  <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
                  <span>⚠️ {unmatchedCount} Skipped Article Codes (Not in Inventory Master)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExcelFilter('unmatched')}
                  className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer bg-amber-500/20 px-2 py-0.5 rounded"
                >
                  View Skipped List
                </button>
              </div>
              <div className="text-[11px] font-mono flex flex-wrap gap-1.5 pt-1">
                {excelRows.filter(r => r.status === 'unmatched').map((r, i) => (
                  <span key={i} className="px-2 py-0.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded border border-amber-500/30 font-bold">
                    {r.rawSku} ({r.displayDate} - ₹{r.rawPrice})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Excel Table */}
          <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                  <th className="py-2 px-3 whitespace-nowrap">Date</th>
                  <th className="py-2 px-3 whitespace-nowrap min-w-[200px]">Raw SKU / Code</th>
                  <th className="py-2 px-3">Matched Product</th>
                  <th className="py-2 px-3 whitespace-nowrap">Size</th>
                  <th className="py-2 px-3 text-center whitespace-nowrap">Qty</th>
                  <th className="py-2 px-3 text-right whitespace-nowrap">Price</th>
                  <th className="py-2 px-3 text-center whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {displayedExcelRows.map((row) => (
                  <tr key={row.id} className={row.status === 'unmatched' ? 'bg-rose-500/10 border-l-4 border-l-rose-500 hover:bg-rose-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}>
                    <td className="py-2 px-3 font-semibold whitespace-nowrap text-slate-600 dark:text-slate-300">{row.displayDate}</td>
                    <td className="py-2 px-3 font-mono font-bold whitespace-nowrap text-xs text-slate-800 dark:text-slate-100">
                      <span className={row.status === 'unmatched' ? 'text-rose-600 dark:text-rose-400 font-extrabold' : ''}>
                        {row.rawSku}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {row.matchedProduct ? (
                        <div>
                          <div className="font-bold text-rose-600 dark:text-rose-400">{row.matchedProduct.name}</div>
                          <div className="text-[10px] text-slate-400">SKU: {row.matchedProduct.sku} ({row.matchedProduct.color})</div>
                        </div>
                      ) : (
                        <div className="space-y-1.5 py-1">
                          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-extrabold text-[11px]">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>❌ Not Found in Inventory Master</span>
                          </div>
                          {row.fuzzyProduct && (
                            <button
                              type="button"
onClick={() => handleSelectFuzzySuggestion(row.id, row.fuzzyProduct!)}
                              className="text-[10px] font-bold text-amber-900 dark:text-amber-100 bg-amber-400/30 hover:bg-amber-400/50 active:scale-95 px-2.5 py-1.5 rounded-lg border border-amber-500/50 inline-flex items-center gap-1.5 cursor-pointer transition-all shadow-sm group"
                              title="Click to select this matched product and turn row Green!"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                              <span>Did you mean: <strong className="font-mono underline">{row.fuzzyProduct.sku}</strong> ({row.fuzzyProduct.color})?</span>
                              <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 rounded font-sans uppercase font-extrabold tracking-wider">Click to Select</span>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 font-bold">{row.parsedSize}</td>
                    <td className="py-2 px-3 text-center font-bold">{row.rawQty}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">₹{row.rawPrice}</td>
                    <td className="py-2 px-3 text-center">
                      {row.status === 'matched' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                          <XCircle className="w-3 h-3" /> Red Alert
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={() => setIsExcelModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleImportExcelSales}
              disabled={isImportingExcel || matchedCount === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isImportingExcel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>Confirm & Remove Matched Articles (Add Sales)</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Logic ERP Direct Sync Modal */}
      <Modal
        isOpen={isLogicModalOpen}
        onClose={() => setIsLogicModalOpen(false)}
        title="Connect & Sync Logic ERP Direct"
      >
        <form onSubmit={handleLogicSync} className="space-y-4">
          <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-1">
            <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Zap className="w-4 h-4" /> Logic ERP Administrator Direct Connection
            </h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Enter your Logic ERP Server URL and Admin Credentials to automatically sync sales invoices date-wise into Saint G Inventory.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Logic ERP Server / Host URL</label>
            <input
              type="text"
              required
              placeholder="e.g. http://192.168.1.100:8080 or http://localhost:8080"
              value={logicServerUrl}
              onChange={(e) => setLogicServerUrl(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-mono focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Admin Username</label>
              <input
                type="text"
                required
                placeholder="Logic Admin User"
                value={logicUsername}
                onChange={(e) => setLogicUsername(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Admin Password</label>
              <input
                type="password"
                placeholder="Logic Admin Password"
                value={logicPassword}
                onChange={(e) => setLogicPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-semibold focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsLogicModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={logicSyncing}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {logicSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />}
              <span>Sync Sales Now</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Missing Article Codes Warning Modal Popup */}
      <Modal
        isOpen={isMissingModalOpen}
        onClose={() => setIsMissingModalOpen(false)}
        title="⚠️ Missing Article Codes Alert"
      >
        <div className="space-y-4 select-none">
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 space-y-2">
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span>{missingCodesList.length} Article Codes Inventory Catalog Me Nahi Hain!</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Ye article codes aapki product inventory me match nahi hue. Baaki sabhi matched articles ki sales regular date-wise process kar di jaayegi. Kripya in missing codes ko <b>Products Catalog</b> me add karein:
            </p>
          </div>

          <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-900 font-mono text-xs space-y-1.5">
            {missingCodesList.map((code, idx) => (
              <div key={idx} className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-850 last:border-none">
                <span className="font-bold text-rose-600 dark:text-rose-400">{code}</span>
                <span className="text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded font-sans font-bold border border-amber-500/20">
                  Article Not Found
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setIsMissingModalOpen(false)}
              className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              Understood / Continue
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
