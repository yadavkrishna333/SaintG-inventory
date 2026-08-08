'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';
import { 
  Truck, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  Clipboard, 
  FileCheck,
  Sparkles,
  History,
  Calendar,
  Download
} from 'lucide-react';
import { write, utils } from 'xlsx';

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  color: string;
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
  dispatchStocks: Record<string, number>; // Size-wise stock quantities being sent to warehouse
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
  const cleanSku = (sku || '').trim().toLowerCase();
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

const parseSkuColor = (code: string) => {
  const clean = code.trim();
  
  // Pattern 1: sg-f-XXXX-color (Women Footwear / Winter Boot)
  let match = clean.match(/^(sg-f-\d+)-(.*)$/i);
  if (match) {
    return { sku: match[1], color: match[2] };
  }
  
  // Pattern 2: sgm-XXXX-color (Men Footwear)
  match = clean.match(/^(sgm-\d+)-(.*)$/i);
  if (match) {
    return { sku: match[1], color: match[2] };
  }
  
  // Pattern 3: sg-j-XXXX-color (Men Jacket)
  match = clean.match(/^(sg-j-\d+)-(.*)$/i);
  if (match) {
    return { sku: match[1], color: match[2] };
  }
  
  // Pattern 4: sg-a-XXXX-color or other prefix
  match = clean.match(/^(sg-[a-z]-\d+)-(.*)$/i);
  if (match) {
    return { sku: match[1], color: match[2] };
  }

  // Fallback: split by last dash
  const lastDash = clean.lastIndexOf('-');
  if (lastDash > 0) {
    return { sku: clean.slice(0, lastDash), color: clean.slice(lastDash + 1) };
  }

  // Double fallback: no color
  return { sku: clean, color: 'N/A' };
};

const getCleanCodeWithoutSize = (rawCode: string): string => {
  const clean = rawCode.trim();
  const allKnownSizes = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '3xl', '4xl', 'one-size', 'free-size', 'onesize', 'freesize'];
  
  for (const sz of allKnownSizes) {
    const suffixes = [`-${sz}eu`, `-${sz}`, `-${sz}e` ];
    for (const suffix of suffixes) {
      if (clean.toLowerCase().endsWith(suffix)) {
        return clean.slice(0, -suffix.length);
      }
    }
  }
  return clean;
};

const getCodePartFromLine = (line: string): string => {
  const parts = line.trim().split(/[\t ]+/);
  return parts[0] || '';
};

const normalizeCode = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/^(sg-?)+/gi, '') // remove leading sg- or sg
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
};

const stripSizeSuffix = (codeNorm: string): string => {
  const allKnownSizes = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '3xl', '4xl', 'one-size', 'free-size', 'onesize', 'freesize'];
  for (const sz of allKnownSizes) {
    const suffixes = [`-${sz}eu`, `-${sz}`, `-${sz}e` ];
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
        c === cleanSku
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

  return null;
};

interface ParsedResult {
  product: Product;
  sizeStocks: Record<string, number>;
  warnings: string[];
}

const getDispatchQuantities = (
  product: Product,
  type: 'single' | 'grid',
  cols: string[],
  headerSizes?: string[],
  singleSize?: string,
  singleQty?: number
): { sizeStocks: Record<string, number>, warnings: string[] } => {
  const catName = getCatName(product.categories);
  const defaultSizes = getCategorySizesByName(catName);
  const warnings: string[] = [];
  
  const sizeStocksInput: Record<string, number> = {};
  defaultSizes.forEach(sz => {
    sizeStocksInput[sz] = 0;
  });

  if (type === 'single' && singleSize) {
    const matchedSize = defaultSizes.find(sz => sz.toLowerCase() === singleSize.toLowerCase()) || defaultSizes[0];
    const available = product.size_stocks?.[matchedSize] || 0;
    const target = singleQty || 0;
    if (target > available) {
      sizeStocksInput[matchedSize] = available;
      warnings.push(`SKU ${product.sku} size ${matchedSize} capped at available stock level (${available}).`);
    } else {
      sizeStocksInput[matchedSize] = target;
    }
    return { sizeStocks: sizeStocksInput, warnings };
  }

  // Grid format
  const rawQtys = cols.slice(1).map(num => parseInt(num) || 0);

  if (headerSizes && headerSizes.length > 0) {
    headerSizes.forEach((sz, idx) => {
      const cleanedSz = sz.trim().toLowerCase();
      const matchedSize = defaultSizes.find(s => s.toLowerCase() === cleanedSz);
      if (matchedSize && idx < rawQtys.length) {
        const available = product.size_stocks?.[matchedSize] || 0;
        const target = rawQtys[idx];
        if (target > available) {
          sizeStocksInput[matchedSize] = available;
          warnings.push(`SKU ${product.sku} size ${matchedSize} capped at available stock level (${available}).`);
        } else {
          sizeStocksInput[matchedSize] = target;
        }
      }
    });
  } else {
    let sizesToMap = [...defaultSizes];
    if (catName === 'Women Footwear' || catName === 'Winter Boot') {
      if (rawQtys.length >= 7) {
        sizesToMap = ['35', '36', '37', '38', '39', '40', '41'];
      } else {
        sizesToMap = ['36', '37', '38', '39', '40', '41'];
      }
    }

    sizesToMap.forEach((sz, idx) => {
      if (idx < rawQtys.length) {
        const available = product.size_stocks?.[sz] || 0;
        const target = rawQtys[idx];
        if (target > available) {
          sizeStocksInput[sz] = available;
          warnings.push(`SKU ${product.sku} size ${sz} capped at available stock level (${available}).`);
        } else {
          sizeStocksInput[sz] = target;
        }
      }
    });
  }

  return { sizeStocks: sizeStocksInput, warnings };
};

const parsePastedLine = (line: string, productsCache: Product[], headerSizes?: string[]): ParsedResult | null => {
  line = line.trim();
  if (!line) return null;

  let cols: string[] = [];
  if (line.includes('\t')) {
    cols = line.split('\t').map(c => c.trim());
  } else {
    cols = line.split(/ +/).map(c => c.trim()).filter(c => c.length > 0);
  }

  if (cols.length === 0) return null;

  const code = cols[0];
  const allKnownSizes = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '3xl', '4xl', 'one size', 'free size'];
  const cleanSizeStr = (s: string) => s.toLowerCase().replace(/eu$/i, '').trim();
  const isSize = (s: string) => allKnownSizes.includes(cleanSizeStr(s));

  // 1. Single format with tabs (Send Warehouse style)
  if (cols.length >= 5 && isSize(cols[2])) {
    const fullBarcode = cols[0];
    const sizeVal = cleanSizeStr(cols[2]);
    const qty = parseInt(cols[5]) || 1;
    const match = findProductMatch(fullBarcode, productsCache);
    if (match) {
      const { sizeStocks, warnings } = getDispatchQuantities(match, 'single', cols, headerSizes, sizeVal, qty);
      return { product: match, sizeStocks, warnings };
    }
  }

  // 2. Single format: [code] [size] [qty] (e.g. "sg-f-1732-black 37eu 2")
  if (cols.length >= 3 && isSize(cols[1])) {
    const size = cleanSizeStr(cols[1]);
    const qty = parseInt(cols[2]) || 1;
    const match = findProductMatch(code, productsCache);
    if (match) {
      const { sizeStocks, warnings } = getDispatchQuantities(match, 'single', cols, headerSizes, size, qty);
      return { product: match, sizeStocks, warnings };
    }
  }

  // 3. Single format: [code] [size] (e.g. "sg-f-1732-black 37eu")
  if (cols.length >= 2 && isSize(cols[cols.length - 1])) {
    const size = cleanSizeStr(cols[cols.length - 1]);
    const codePart = cols.slice(0, cols.length - 1).join('-');
    const match = findProductMatch(codePart, productsCache);
    if (match) {
      const { sizeStocks, warnings } = getDispatchQuantities(match, 'single', cols, headerSizes, size, 1);
      return { product: match, sizeStocks, warnings };
    }
  }

  // 4. Single format: Hyphen-attached size at end (e.g. "sg-f-1732-black-37eu" or "sg-f-1732-black-37eu 2")
  const hyphenParts = line.split('-');
  if (hyphenParts.length >= 2) {
    const lastPart = hyphenParts[hyphenParts.length - 1].trim();
    const spaceSplit = lastPart.split(/ +/).filter(p => p.length > 0);
    const potentialSize = spaceSplit[0];
    const qty = spaceSplit.length > 1 ? (parseInt(spaceSplit[1]) || 1) : 1;

    if (isSize(potentialSize)) {
      const size = cleanSizeStr(potentialSize);
      const codePart = hyphenParts.slice(0, hyphenParts.length - 1).join('-');
      const match = findProductMatch(codePart, productsCache);
      if (match) {
        const { sizeStocks, warnings } = getDispatchQuantities(match, 'single', cols, headerSizes, size, qty);
        return { product: match, sizeStocks, warnings };
      }
    }
  }

  // 5. Grid format
  if (cols.length >= 2) {
    const match = findProductMatch(code, productsCache);
    if (match) {
      const { sizeStocks, warnings } = getDispatchQuantities(match, 'grid', cols, headerSizes);
      return { product: match, sizeStocks, warnings };
    }
  }

  return null;
};

export default function SendWarehousePage() {
  const [pasteInput, setPasteInput] = useState('');
  const [dispatchList, setDispatchList] = useState<DispatchItem[]>([]);
  const [unmatchedCodes, setUnmatchedCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  const [productsCache, setProductsCache] = useState<Product[]>([]);

  // Recently Confirmed Dispatches for Excel/PDF download
  const [recentlyConfirmedList, setRecentlyConfirmedList] = useState<{ sku: string; color: string; size: string; quantity: number; categoryName?: string }[]>([]);

  const [historyLogs, setHistoryLogs] = useState<StockHistoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryTab, setSelectedHistoryTab] = useState<string>('');
  const [historyDates, setHistoryDates] = useState<string[]>([]);

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
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const startIso = fiveDaysAgo.toISOString();

      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, products(sku, name, color, categories(name))')
        .eq('type', 'OUT')
        .like('reason', 'Send Warehouse | Size: %')
        .gte('created_at', startIso)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setHistoryLogs(data || []);
    } catch (err: any) {
      console.error('Error loading history logs:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load pending list and recently confirmed list on mount
  useEffect(() => {
    loadData();
    const dates = getThreeDaysList();
    setHistoryDates(dates);
    setSelectedHistoryTab(dates[0]);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ky_pending_send_warehouse');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setDispatchList(parsed);
        } catch (e) {
          console.error('Error parsing pending send-warehouse list:', e);
        }
      }
      const savedConfirmed = localStorage.getItem('ky_recent_confirmed_send_warehouse');
      if (savedConfirmed) {
        try {
          setRecentlyConfirmedList(JSON.parse(savedConfirmed));
        } catch (e) {}
      }
    }
  }, []);

  // Save pending list whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ky_pending_send_warehouse', JSON.stringify(dispatchList));
    }
  }, [dispatchList]);

  const handleLoadArticles = () => {
    if (!selectedCategoryId) {
      showToast('Please select a category first', 'warning');
      return;
    }

    if (!pasteInput.trim()) {
      showToast('Please paste or enter some article codes first', 'warning');
      return;
    }

    setLoading(true);
    const lines = pasteInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const uniqueLines = Array.from(new Set(lines));

    const newDispatchItems: DispatchItem[] = [...dispatchList];
    const failedCodes: string[] = [];
    const warningList: string[] = [];

    // First check if first line is a header
    let headerSizes: string[] = [];
    let startIdx = 0;
    const firstLine = uniqueLines[0]?.toLowerCase() || '';
    if (firstLine.startsWith('sku') || firstLine.startsWith('barcode') || firstLine.startsWith('sr.no') || firstLine.startsWith('sr no')) {
      const headerParts = uniqueLines[0].split('\t').map(h => h.trim().replace(/eu/i, ''));
      headerSizes = headerParts.slice(1).map(h => h.toLowerCase());
      startIdx = 1; // skip header line in loop
    }

    for (let i = startIdx; i < uniqueLines.length; i++) {
      const line = uniqueLines[i];
      const parsed = parsePastedLine(line, productsCache, headerSizes);

      if (parsed) {
        const { product: match, sizeStocks, warnings } = parsed;

        // Category filter check
        if (match.category_id !== selectedCategoryId) {
          failedCodes.push(line);
          continue;
        }

        const existingIdx = newDispatchItems.findIndex(item => item.product.id === match.id);
        if (existingIdx > -1) {
          // Merge size stocks!
          Object.keys(sizeStocks).forEach(sz => {
            newDispatchItems[existingIdx].dispatchStocks[sz] = (newDispatchItems[existingIdx].dispatchStocks[sz] || 0) + sizeStocks[sz];
          });
        } else {
          newDispatchItems.push({
            product: match,
            dispatchStocks: sizeStocks
          });
        }

        if (warnings.length > 0) {
          warningList.push(...warnings);
        }
      } else {
        failedCodes.push(line);
      }
    }

    if (newDispatchItems.length === 0) {
      setUnmatchedCodes(failedCodes);
      setPasteInput('');
      setLoading(false);
      showToast('No articles could be parsed.', 'warning');
      return;
    }

    // Confirmation popup
    const parsedSummary = newDispatchItems.map(item => {
      const dispatchSizes = Object.keys(item.dispatchStocks).filter(sz => item.dispatchStocks[sz] > 0);
      const sizesStr = dispatchSizes.map(sz => `Size ${sz} (-${item.dispatchStocks[sz]} units)`).join(', ');
      return `- SKU ${item.product.sku} (${item.product.color || 'N/A'}): ${sizesStr || 'No sizes specified'}`;
    }).join('\n');

    if (!confirm(`Are you sure you want to load the following parsed articles to the pending list?\n\n${parsedSummary}`)) {
      setLoading(false);
      return;
    }

    setDispatchList(newDispatchItems);
    setUnmatchedCodes(failedCodes);
    setPasteInput('');
    setLoading(false);

    warningList.forEach(warn => showToast(warn, 'warning'));

    if (failedCodes.length > 0) {
      showToast(`Processed lines. ${failedCodes.length} lines could not be matched or resolved.`, 'warning');
    } else {
      showToast(`Successfully processed all pasted lines!`, 'success');
    }
  };

  const handleSizeQtyChange = (productId: string, size: string, value: number) => {
    setDispatchList(prev => 
      prev.map(item => {
        if (item.product.id === productId) {
          const availableStock = item.product.size_stocks?.[size] || 0;
          const cappedVal = Math.max(0, Math.min(availableStock, value));
          if (value > availableStock) {
            showToast(`Capped size ${size} at maximum available stock level (${availableStock}).`, 'warning');
          }
          return {
            ...item,
            dispatchStocks: {
              ...item.dispatchStocks,
              [size]: cappedVal
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

    let totalDispatchedQty = 0;
    dispatchList.forEach(item => {
      totalDispatchedQty += Object.values(item.dispatchStocks).reduce((sum, q) => sum + Number(q || 0), 0);
    });

    if (totalDispatchedQty === 0) {
      showToast('Please enter dispatch quantities for at least one article size', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      for (const item of dispatchList) {
        const prod = item.product;
        const addedQty = Object.values(item.dispatchStocks).reduce((sum, q) => sum + Number(q || 0), 0);
        
        if (addedQty > 0) {
          const updatedSizeStocks = { ...prod.size_stocks };
          
          // Deduct size stocks and insert stock movements for each size
          for (const sz of Object.keys(item.dispatchStocks)) {
            const qty = item.dispatchStocks[sz];
            if (qty > 0) {
              updatedSizeStocks[sz] = (Number(updatedSizeStocks[sz]) || 0) - qty;

              // Insert stock movement record per size
              const { error: moveErr } = await supabase
                .from('stock_movements')
                .insert({
                  product_id: prod.id,
                  type: 'OUT',
                  quantity: qty,
                  reason: `Send Warehouse | Size: ${sz}`
                });
              if (moveErr) throw moveErr;

              const detailsMsg = `Sent ${qty} units of size ${sz} for SKU ${prod.sku} (${prod.color || 'N/A'}) to warehouse.`;
              await supabase.from('activity_logs').insert({
                action: 'STOCK_REMOVED',
                details: detailsMsg
              });
            }
          }

          const newTotalStock = prod.current_stock - addedQty;

          const { error: updateErr } = await supabase
            .from('products')
            .update({
              size_stocks: updatedSizeStocks,
              current_stock: newTotalStock
            })
            .eq('id', prod.id);
          if (updateErr) throw updateErr;
        }
      }

      // Build a flat list of confirmed items for the Excel/PDF download
      const confirmedBatch: typeof recentlyConfirmedList = [];
      dispatchList.forEach(item => {
        const catName = getCatName(item.product.categories);
        Object.keys(item.dispatchStocks).forEach(sz => {
          const qty = item.dispatchStocks[sz];
          if (qty > 0) {
            confirmedBatch.push({
              sku: item.product.sku,
              color: item.product.color,
              size: sz,
              quantity: qty,
              categoryName: catName
            });
          }
        });
      });
      setRecentlyConfirmedList(confirmedBatch);

      if (typeof window !== 'undefined') {
        localStorage.setItem('ky_recent_confirmed_send_warehouse', JSON.stringify(confirmedBatch));
        localStorage.removeItem('ky_pending_send_warehouse');
      }

      showToast(`Articles dispatched successfully! Logged -${totalDispatchedQty} units.`, 'success');
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
      const catName = item.categoryName || '';
      const articleCode = formatArticleCode(item.sku, item.color, item.size, catName);
      return {
        'SKU Code': articleCode,
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
    utils.book_append_sheet(wb, ws, 'Confirmed Warehouse Removals');

    ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }];

    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `KY_Confirmed_Warehouse_Removals_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    showToast('Exported confirmed removals successfully!', 'success');
  };

  const handlePrintConfirmedPdf = () => {
    if (recentlyConfirmedList.length === 0) {
      showToast('No recently confirmed dispatches to export', 'warning');
      return;
    }

    const htmlRows = recentlyConfirmedList.map((item) => {
      const catName = item.categoryName || '';
      const articleCode = formatArticleCode(item.sku, item.color, item.size, catName);
      return `
        <tr>
          <td>${articleCode}</td>
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
            <title>Confirmed Warehouse Dispatch Report</title>
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
                <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">Confirmed Sent Articles (Warehouse Dispatch)</p>
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
                  <td colspan="2" style="text-align: right;">Grand Total Confirmed Sent:</td>
                  <td style="text-align: center; font-weight: 900; font-size: 13px;">${recentlyConfirmedList.reduce((sum, item) => sum + item.quantity, 0)}</td>
                </tr>
              </tbody>
            </table>
            <footer>
              KY Inventory Operations System. Confirmed warehouse dispatch report.
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
      let sizeName = 'N/A';
      if (log.reason && log.reason.includes('| Size:')) {
        sizeName = log.reason.split('|')[1].replace('Size:', '').trim();
      }
      const catName = log.products?.categories?.name || '';
      const articleCode = formatArticleCode(log.products?.sku || '', log.products?.color || '', sizeName, catName);
      
      return {
        'Date & Time': new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        'Article Code': articleCode,
        'Color': log.products?.color || 'N/A',
        'Size': sizeName,
        'Quantity': log.quantity
      };
    });

    const totalQty = filteredLogs.reduce((sum, log) => sum + Number(log.quantity || 0), 0);
    wsData.push({
      'Date & Time': 'Total',
      'Article Code': '',
      'Color': '',
      'Size': '',
      'Quantity': totalQty
    });

    const ws = utils.json_to_sheet(wsData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Warehouse Dispatch History');

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
    a.download = `Warehouse_Dispatch_History_${dateTab}.xlsx`;
    a.click();
    showToast(`Warehouse dispatch history Excel for ${dateTab} exported!`, 'success');
  };

  const handlePrintHistoryPdf = (dateTab: string) => {
    const filteredLogs = historyLogs.filter(log => getLocalDateString(log.created_at) === dateTab);
    if (filteredLogs.length === 0) {
      showToast(`No history logs found for ${dateTab} to export`, 'warning');
      return;
    }

    const htmlRows = filteredLogs.map((log) => {
      let sizeName = 'N/A';
      if (log.reason && log.reason.includes('| Size:')) {
        sizeName = log.reason.split('|')[1].replace('Size:', '').trim();
      }
      const catName = log.products?.categories?.name || '';
      const articleCode = formatArticleCode(log.products?.sku || '', log.products?.color || '', sizeName, catName);
      return `
        <tr>
          <td>${new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
          <td style="font-family: monospace; font-weight: bold; color: #e11d48;">${articleCode}</td>
          <td>${log.products?.color || 'N/A'}</td>
          <td style="text-align: center;">${sizeName}</td>
          <td style="text-align: center; font-weight: bold;">${log.quantity}</td>
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
            <title>Warehouse Dispatch History Report - ${dateTab}</title>
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
                <h1>Saint G Inventory</h1>
                <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">Warehouse Dispatch History Report</p>
              </div>
              <div style="text-align: right;">
                <span class="date">Date: ${dateTab}</span>
              </div>
            </header>
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Article Code</th>
                  <th>Color</th>
                  <th style="text-align: center;">Size</th>
                  <th style="text-align: center;">Quantity</th>
                </tr>
              </thead>
              <tbody>
                ${htmlRows}
                <tr class="total-row">
                  <td colspan="4" style="text-align: right;">Grand Total Sent:</td>
                  <td style="text-align: center; font-weight: 900; font-size: 13px;">${filteredLogs.reduce((sum, log) => sum + Number(log.quantity || 0), 0)}</td>
                </tr>
              </tbody>
            </table>
            <footer>
              Saint G Inventory Operations System. Warehouse dispatch history log report.
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

  // Grand Total calculation
  let grandTotalQty = 0;
  dispatchList.forEach(item => {
    grandTotalQty += Object.values(item.dispatchStocks).reduce((sum, q) => sum + Number(q || 0), 0);
  });

  return (
    <div className="flex flex-col gap-6 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-850 dark:text-white flex items-center gap-2">
            <Truck className="w-8 h-8 text-rose-500 bg-rose-500/10 p-1 rounded-xl animate-pulse" />
            Send Warehouse
          </h1>
          <p className="text-sm text-slate-500 mt-1">Bulk outbound stock removals by pasting article codes followed by size-wise quantities to dispatch to the warehouse.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Paste Inputs */}
        <div className="lg:col-span-1 flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div>
            <h2 className="font-extrabold text-base text-slate-850 dark:text-white">Paste Article Codes</h2>
            <p className="text-xs text-slate-400 mt-0.5">Format: <code>[code] [qty1] [qty2]...</code> (grid quantities) or standard copy-paste from Excel sheets.</p>
          </div>

          {/* Category Dropdown Option */}
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
            placeholder="e.g.&#10;SG-F-1841-BLACK	0	3	0	1	1	1"
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
          />

          <button
            onClick={handleLoadArticles}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
          >
            Load Articles
          </button>
        </div>

        {/* Right Side: Quantities Grid review and edit */}
        <div className="lg:col-span-2 flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-extrabold text-base text-slate-850 dark:text-white">Active Dispatch List</h2>
              <p className="text-xs text-slate-400 mt-0.5">Review, edit size-wise quantities, and confirm dispatch to warehouse.</p>
            </div>
            {dispatchList.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 active:scale-95 transition-all"
              >
                Clear All
              </button>
            )}
          </div>

          {dispatchList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
              <Clipboard className="w-10 h-10 mb-2 stroke-[1.5]" />
              <p className="text-xs font-semibold">No products loaded.</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Paste article codes and load them to start.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[500px] pr-1">
              {dispatchList.map((item) => {
                 const catName = getCatName(item.product.categories);
                 const sizes = getCategorySizesByName(catName);

                return (
                  <div 
                    key={item.product.id} 
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20 relative group hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                  >
                    {/* Delete button */}
                    <button
                      onClick={() => handleRemoveItem(item.product.id)}
                      className="absolute top-4 right-4 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-955/40 text-slate-400 hover:text-rose-500 transition-all active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Product details header */}
                    <div className="pr-8 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-rose-600 dark:text-rose-400">
                          {item.product.sku.toUpperCase()}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {catName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>Color: <strong className="text-slate-655 dark:text-slate-300 font-semibold">{item.product.color}</strong></span>
                        <span>•</span>
                        <span>Current Stock: <strong className="text-slate-655 dark:text-slate-300 font-semibold">{item.product.current_stock} pcs</strong></span>
                      </div>
                    </div>

                    {/* Sizes quantity inputs */}
                    <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2 pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
                      {sizes.map((sz) => {
                        const qty = item.dispatchStocks[sz] || 0;
                        const available = item.product.size_stocks?.[sz] || 0;

                        return (
                          <div key={sz} className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-400 text-center">
                              {sz} <span className="text-[9px] font-normal text-slate-400">({available})</span>
                            </span>
                            <input
                              type="number"
                              min="0"
                              max={available}
                              value={qty || ''}
                              onChange={(e) => handleSizeQtyChange(item.product.id, sz, parseInt(e.target.value) || 0)}
                              className="w-full text-center px-1 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder:text-slate-400"
                              placeholder="0"
                              disabled={available === 0}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Confirm panel */}
          {dispatchList.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grand Total Pieces</span>
                <span className="text-xl font-extrabold text-slate-800 dark:text-white">{grandTotalQty} pcs</span>
              </div>
              <button
                onClick={handleConfirmDispatch}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs tracking-wider uppercase shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                Confirm Dispatch to Warehouse
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Unmatched list errors if any */}
      {unmatchedCodes.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <AlertCircle className="w-4 h-4" />
            <span>Unmatched Pasted Lines ({unmatchedCodes.length})</span>
          </div>
          <p className="text-xs">
            The following lines could not be parsed or did not match any products in your active category catalog. Please check their barcodes, SKUs, or colors and try again:
          </p>
          <div className="bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-xs overflow-x-auto select-text whitespace-pre max-h-40">
            {unmatchedCodes.join('\n')}
          </div>
        </div>
      )}      {/* History Log Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-rose-500 animate-pulse" />
            <h2 className="font-extrabold text-base tracking-tight text-slate-855 dark:text-white">Recent Send Warehouse History</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportHistoryExcel(selectedHistoryTab)}
              disabled={historyLogs.filter(log => getLocalDateString(log.created_at) === selectedHistoryTab).length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-855 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button
              onClick={() => handlePrintHistoryPdf(selectedHistoryTab)}
              disabled={historyLogs.filter(log => getLocalDateString(log.created_at) === selectedHistoryTab).length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-855 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <span>PDF</span>
            </button>
            <button 
              onClick={fetchHistory}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-855 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-all active:scale-95 cursor-pointer"
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
            const logCount = historyLogs.filter(log => getLocalDateString(log.created_at) === dateTab).length;
            
            return (
              <button
                key={dateTab}
                onClick={() => setSelectedHistoryTab(dateTab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-850'
                }`}
              >
                {dateTab === historyDates[0] ? 'Today' : dateTab === historyDates[1] ? 'Yesterday' : dateTab} ({logCount})
              </button>
            );
          })}
        </div>

        {historyLoading && historyLogs.filter(log => getLocalDateString(log.created_at) === selectedHistoryTab).length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading history audit logs...</div>
        ) : historyLogs.filter(log => getLocalDateString(log.created_at) === selectedHistoryTab).length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">No warehouse dispatches recorded on {selectedHistoryTab}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Article Code</th>
                  <th className="py-3 px-4">Article Details</th>
                  <th className="py-3 px-4 text-center">Size</th>
                  <th className="py-3 px-4 text-center">Quantity</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {historyLogs
                  .filter(log => getLocalDateString(log.created_at) === selectedHistoryTab)
                  .map((log) => {
                    // Extract size name from reason: "Send Warehouse | Size: 38"
                    let sizeName = 'N/A';
                    if (log.reason && log.reason.includes('| Size:')) {
                      sizeName = log.reason.split('|')[1].replace('Size:', '').trim();
                    }
                    const catName = log.products?.categories?.name || '';
                    const articleCode = formatArticleCode(log.products?.sku || '', log.products?.color || '', sizeName, catName);

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
                        <td className="py-3 px-4 text-center font-bold text-slate-600 dark:text-slate-400">
                          {sizeName}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            -{log.quantity}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-medium">Send Warehouse</td>
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
              <h2 className="font-extrabold text-base tracking-tight text-slate-855 dark:text-white">Recently Confirmed Warehouse Removals (Ready to Download)</h2>
              <p className="text-xs text-slate-500">Exactly what was sent to warehouse during your last confirmation. Download Excel or PDF report below.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportConfirmedExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-555 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm font-sans"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Excel</span>
              </button>
              <button
                onClick={handlePrintConfirmedPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-555 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm font-sans"
              >
                <span>Download PDF</span>
              </button>
              <button
                onClick={() => {
                  if (confirm('Clear recently confirmed session list?')) {
                    setRecentlyConfirmedList([]);
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('ky_recent_confirmed_send_warehouse');
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
                  const catName = item.categoryName || '';
                  const articleCode = formatArticleCode(item.sku, item.color, item.size, catName);
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
                      <td className="py-2 px-4 font-mono text-slate-500 text-[11px]">{articleCode}</td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50/50 dark:bg-slate-950/20 font-bold border-t border-slate-200 dark:border-slate-800">
                  <td colSpan={3} className="py-3 px-4 text-right text-slate-500 uppercase tracking-wider">Grand Total Sum:</td>
                  <td className="py-3 px-4 text-center text-rose-600 dark:text-rose-400 text-sm font-extrabold">
                    {recentlyConfirmedList.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}
                  </td>
                  <td className="py-3 px-4"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
