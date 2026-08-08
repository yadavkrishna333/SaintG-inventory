'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';
import Modal from '@/components/ui/modal';
import { 
  ArrowUpRight, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  Clipboard, 
  FileCheck,
  Sparkles,
  History,
  Calendar,
  Download,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  XCircle,
  Package,
  HelpCircle,
  Check
} from 'lucide-react';
import { read, write, utils } from 'xlsx';

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

interface ReplenishItem {
  product: Product;
  addedStocks: Record<string, number>; // Size-wise added stock quantities
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

const autoCreateProduct = async (code: string, selectedCategoryId: string, categories: Category[]): Promise<Product | null> => {
  const { sku: parsedSku, color } = parseSkuColor(code);
  const skuVal = code.toUpperCase();
  const barcodeVal = `SG-${skuVal.replace(/\s+/g, '-')}`;

  // Resolve category id
  let catId: string | null = null;
  let catName = 'Women Footwear'; // default

  if (selectedCategoryId && selectedCategoryId !== 'all') {
    catId = selectedCategoryId;
    const cat = categories.find(c => c.id === selectedCategoryId);
    if (cat) catName = cat.name;
  } else {
    // Infer category from SKU
    const skuLower = parsedSku.toLowerCase();
    if (skuLower.includes('-f-') || skuLower.startsWith('sg-f-')) {
      catName = 'Women Footwear';
    } else if (skuLower.includes('-m-') || skuLower.startsWith('sgm-')) {
      catName = 'Mens Footwear';
    } else if (skuLower.includes('-j-') || skuLower.startsWith('sg-j-')) {
      catName = 'Mens Jacket';
    } else {
      catName = 'Apparels';
    }
    const cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
    if (cat) catId = cat.id;
  }

  // Set default size stocks structure for database
  const defaultSizes = getCategorySizesByName(catName);
  const sizeStocks: Record<string, number> = {};
  defaultSizes.forEach(sz => {
    sizeStocks[sz] = 0;
  });

  const newProd = {
    sku: skuVal,
    color,
    name: '',
    brand: 'KY',
    category_id: catId,
    barcode: barcodeVal,
    size_stocks: sizeStocks,
    current_stock: 0,
    purchase_price: 0,
    selling_price: 0,
  };

  const { data, error } = await supabase
    .from('products')
    .insert(newProd)
    .select('*, categories(id, name)')
    .single();

  if (error) {
    console.error('Error auto-creating product:', error);
    return null;
  }
  return data as Product;
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
}

const getReplenishQuantities = (
  product: Product,
  type: 'single' | 'grid',
  cols: string[],
  headerSizes?: string[],
  singleSize?: string,
  singleQty?: number
): Record<string, number> => {
  const catName = getCatName(product.categories);
  const defaultSizes = getCategorySizesByName(catName);
  
  const sizeStocksInput: Record<string, number> = {};
  defaultSizes.forEach(sz => {
    sizeStocksInput[sz] = 0;
  });

  if (type === 'single' && singleSize) {
    const matchedSize = defaultSizes.find(sz => sz.toLowerCase() === singleSize.toLowerCase()) || defaultSizes[0];
    sizeStocksInput[matchedSize] = singleQty || 0;
    return sizeStocksInput;
  }

  // Grid format
  const rawQtys = cols.slice(1).map(num => parseInt(num) || 0);

  if (headerSizes && headerSizes.length > 0) {
    // Map using header sizes
    headerSizes.forEach((sz, idx) => {
      const cleanedSz = sz.trim().toLowerCase();
      const matchedSize = defaultSizes.find(s => s.toLowerCase() === cleanedSz);
      if (matchedSize && idx < rawQtys.length) {
        sizeStocksInput[matchedSize] = rawQtys[idx];
      }
    });
  } else {
    // Fallback: map using standard sizesToMap
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
        sizeStocksInput[sz] = rawQtys[idx];
      }
    });
  }

  return sizeStocksInput;
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
      const sizeStocks = getReplenishQuantities(match, 'single', cols, headerSizes, sizeVal, qty);
      return { product: match, sizeStocks };
    }
  }

  // 2. Single format: [code] [size] [qty] (e.g. "sg-f-1732-black 37eu 2")
  if (cols.length >= 3 && isSize(cols[1])) {
    const size = cleanSizeStr(cols[1]);
    const qty = parseInt(cols[2]) || 1;
    const match = findProductMatch(code, productsCache);
    if (match) {
      const sizeStocks = getReplenishQuantities(match, 'single', cols, headerSizes, size, qty);
      return { product: match, sizeStocks };
    }
  }

  // 3. Single format: [code] [size] (e.g. "sg-f-1732-black 37eu")
  if (cols.length >= 2 && isSize(cols[cols.length - 1])) {
    const size = cleanSizeStr(cols[cols.length - 1]);
    const codePart = cols.slice(0, cols.length - 1).join('-');
    const match = findProductMatch(codePart, productsCache);
    if (match) {
      const sizeStocks = getReplenishQuantities(match, 'single', cols, headerSizes, size, 1);
      return { product: match, sizeStocks };
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
        const sizeStocks = getReplenishQuantities(match, 'single', cols, headerSizes, size, qty);
        return { product: match, sizeStocks };
      }
    }
  }

  // 5. Grid format
  if (cols.length >= 2) {
    const match = findProductMatch(code, productsCache);
    if (match) {
      const sizeStocks = getReplenishQuantities(match, 'grid', cols, headerSizes);
      return { product: match, sizeStocks };
    }
  }

  return null;
};

interface ExcelReplenishRow {
  id: string;
  srNo: string;
  rawSku: string;
  rawQty: number;
  matchedProduct: Product | null;
  parsedSize: string;
  status: 'matched' | 'unmatched';
}

export default function ReplenishmentPage() {
  const [pasteInput, setPasteInput] = useState('');
  const [replenishList, setReplenishList] = useState<ReplenishItem[]>([]);
  const [unmatchedCodes, setUnmatchedCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Categories and selected category filter
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  // Cache for quick lookups on the client-side
  const [productsCache, setProductsCache] = useState<Product[]>([]);
  
  // History list
  const [historyLogs, setHistoryLogs] = useState<StockHistoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryTab, setSelectedHistoryTab] = useState<string>('');
  const [historyDates, setHistoryDates] = useState<string[]>([]);

  // Excel Upload State & Ref
  const [excelRows, setExcelRows] = useState<ExcelReplenishRow[]>([]);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const excelFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleExcelReorderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = read(buffer, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[firstSheetName];

        const rawRows: any[][] = utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (rawRows.length === 0) {
          showToast('The uploaded Excel file is empty', 'warning');
          return;
        }

        let headerRowIndex = -1;
        let srCol = -1;
        let skuCol = -1;
        let qtyCol = -1;

        for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').trim().toUpperCase();
            if (val.includes('SR') || val.includes('S.NO') || val.includes('SNO')) srCol = c;
            if (val.includes('SKU') || val.includes('CODE') || val.includes('ARTICLE') || val.includes('BARCODE') || val.includes('ITEM')) {
              skuCol = c;
              headerRowIndex = r;
            }
            if (val.includes('QTY') || val.includes('QUANTITY') || val.includes('PCS') || val.includes('COUNT') || val.includes('REORDER')) qtyCol = c;
          }
          if (headerRowIndex !== -1) break;
        }

        if (srCol === -1) srCol = 0; // Col 0: Sr No
        if (skuCol === -1) skuCol = 1; // Col 1: SKU Code
        if (qtyCol === -1) qtyCol = 2; // Col 2: Qty

        const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
        const parsed: ExcelReplenishRow[] = [];

        for (let r = startRow; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!Array.isArray(row) || row.length === 0) continue;

          const rawSku = String(row[skuCol] || '').trim();
          if (!rawSku || /SR|TOTAL|SNO|HEADER|SUBTOTAL|GRAND|SKU CODE/i.test(rawSku)) continue;

          const srNo = String(row[srCol] || r + 1).trim();
          const rawQty = parseInt(String(row[qtyCol]), 10) || 1;

          let matched = findProductMatch(rawSku, productsCache);
          if (!matched) {
            const nums = rawSku.match(/\d{3,4}/);
            if (nums) {
              const numStr = nums[0];
              matched = productsCache.find(p => {
                const pClean = normalizeCode(p.sku);
                const bClean = normalizeCode(p.barcode || '');
                return pClean.includes(numStr) || bClean.includes(numStr);
              }) || null;
            }
          }

          let parsedSize = 'One Size';
          if (matched) {
            const catName = getCatName(matched.categories);
            const defaultSizes = getCategorySizesByName(catName);
            
            const codeLower = rawSku.toLowerCase();
            const foundSize = defaultSizes.find(sz => {
              const sLower = sz.toLowerCase();
              return codeLower.endsWith(`-${sLower}`) || codeLower.endsWith(`-${sLower}eu`) || codeLower.endsWith(` ${sLower}`);
            });
            parsedSize = foundSize || defaultSizes[0] || 'One Size';
          }

          parsed.push({
            id: `excel-replenish-${r}-${Math.random()}`,
            srNo,
            rawSku,
            rawQty,
            matchedProduct: matched,
            parsedSize,
            status: matched ? 'matched' : 'unmatched'
          });
        }

        if (parsed.length === 0) {
          showToast('No valid article rows found in Excel file', 'warning');
          return;
        }

        setExcelRows(parsed);
        setIsExcelModalOpen(true);
        showToast(`Parsed ${parsed.length} rows from Excel file!`, 'success');
      } catch (err: any) {
        showToast(err.message || 'Error parsing Excel file', 'error');
      } finally {
        if (e.target) e.target.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleConfirmExcelImport = () => {
    const matchedRows = excelRows.filter(r => r.matchedProduct !== null);
    if (matchedRows.length === 0) {
      showToast('No matched items to import', 'warning');
      return;
    }

    const newReplenishItems: ReplenishItem[] = [...replenishList];

    matchedRows.forEach(r => {
      const product = r.matchedProduct!;
      const size = r.parsedSize;
      const qty = r.rawQty;

      const existingIdx = newReplenishItems.findIndex(item => item.product.id === product.id);
      if (existingIdx > -1) {
        newReplenishItems[existingIdx].addedStocks[size] = (newReplenishItems[existingIdx].addedStocks[size] || 0) + qty;
      } else {
        const catName = getCatName(product.categories);
        const defaultSizes = getCategorySizesByName(catName);
        const addedStocks: Record<string, number> = {};
        defaultSizes.forEach(sz => { addedStocks[sz] = 0; });
        addedStocks[size] = qty;

        newReplenishItems.push({
          product,
          addedStocks
        });
      }
    });

    setReplenishList(newReplenishItems);
    setIsExcelModalOpen(false);
    showToast(`Successfully added ${matchedRows.length} reorder articles to Replenishment List!`, 'success');
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
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const startIso = fiveDaysAgo.toISOString();

      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, products(sku, name, color, categories(name))')
        .eq('type', 'IN')
        .ilike('reason', 'Bulk Replenishment%')
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

  // Load pending list on mount
  useEffect(() => {
    loadData();
    const dates = getThreeDaysList();
    setHistoryDates(dates);
    setSelectedHistoryTab(dates[0]);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ky_pending_replenishment');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setReplenishList(parsed);
        } catch (e) {
          console.error('Error parsing pending replenishment list:', e);
        }
      }
    }
  }, []);

  // Save pending list whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ky_pending_replenishment', JSON.stringify(replenishList));
    }
  }, [replenishList]);

  const handleLoadArticles = async () => {
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

    const newReplenishItems: ReplenishItem[] = [...replenishList];
    const failedCodes: string[] = [];
    
    let currentCache = [...productsCache];

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
      let parsed = parsePastedLine(line, currentCache, headerSizes);
      
      if (!parsed) {
        const rawCodePart = getCodePartFromLine(line);
        const cleanCodePart = getCleanCodeWithoutSize(rawCodePart);
        if (cleanCodePart) {
          const newProduct = await autoCreateProduct(cleanCodePart, selectedCategoryId, categories);
          if (newProduct) {
            currentCache.push(newProduct);
            parsed = parsePastedLine(line, currentCache, headerSizes);
          }
        }
      }

      if (parsed) {
        const { product: match, sizeStocks } = parsed;

        // Category filter check
        if (match.category_id !== selectedCategoryId) {
          failedCodes.push(line);
          continue;
        }

        const catName = getCatName(match.categories);
        const defaultSizes = getCategorySizesByName(catName);

        const existingIdx = newReplenishItems.findIndex(item => item.product.id === match.id);
        if (existingIdx > -1) {
          // Merge size stocks!
          Object.keys(sizeStocks).forEach(sz => {
            newReplenishItems[existingIdx].addedStocks[sz] = (newReplenishItems[existingIdx].addedStocks[sz] || 0) + sizeStocks[sz];
          });
        } else {
          newReplenishItems.push({
            product: match,
            addedStocks: sizeStocks
          });
        }
      } else {
        failedCodes.push(line);
      }
    }

    if (newReplenishItems.length === 0) {
      setProductsCache(currentCache);
      setUnmatchedCodes(failedCodes);
      setPasteInput('');
      setLoading(false);
      showToast('No articles could be parsed.', 'warning');
      return;
    }

    // Show confirmation popup before adding to pending list
    const parsedSummary = newReplenishItems.map(item => {
      const addedSizes = Object.keys(item.addedStocks).filter(sz => item.addedStocks[sz] > 0);
      const sizesStr = addedSizes.map(sz => `Size ${sz} (${item.addedStocks[sz]} units)`).join(', ');
      return `- SKU ${item.product.sku} (${item.product.color || 'N/A'}): ${sizesStr || 'No sizes specified'}`;
    }).join('\n');

    if (!confirm(`Are you sure you want to load the following parsed articles to the pending list?\n\n${parsedSummary}`)) {
      setLoading(false);
      return;
    }

    setProductsCache(currentCache);
    setReplenishList(newReplenishItems);
    setUnmatchedCodes(failedCodes);
    setPasteInput('');
    setLoading(false);

    if (failedCodes.length > 0) {
      showToast(`Processed lines. ${failedCodes.length} lines could not be matched or resolved.`, 'warning');
    } else {
      showToast(`Successfully processed all pasted lines!`, 'success');
    }
  };

  const handleSizeQtyChange = (productId: string, size: string, value: number) => {
    setReplenishList(prev => 
      prev.map(item => {
        if (item.product.id === productId) {
          return {
            ...item,
            addedStocks: {
              ...item.addedStocks,
              [size]: Math.max(0, value)
            }
          };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (productId: string) => {
    setReplenishList(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleClearAll = () => {
    if (confirm('Clear the replenishment list?')) {
      setReplenishList([]);
      setUnmatchedCodes([]);
    }
  };

  const handleConfirmReplenish = async () => {
    if (replenishList.length === 0) {
      showToast('No articles in the replenishment list', 'warning');
      return;
    }

    let totalAddedQty = 0;
    replenishList.forEach(item => {
      totalAddedQty += Object.values(item.addedStocks).reduce((sum, q) => sum + Number(q || 0), 0);
    });

    if (totalAddedQty === 0) {
      showToast('Please enter replenishment quantities for at least one article size', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      for (const item of replenishList) {
        const prod = item.product;
        const addedQty = Object.values(item.addedStocks).reduce((sum, q) => sum + Number(q || 0), 0);
        
        if (addedQty > 0) {
          const updatedSizeStocks = { ...prod.size_stocks };
          
          // Deduct size stocks and insert stock movements for each size
          for (const sz of Object.keys(item.addedStocks)) {
            const qty = item.addedStocks[sz];
            if (qty > 0) {
              updatedSizeStocks[sz] = (Number(updatedSizeStocks[sz]) || 0) + qty;

              // Insert stock movement record per size
              const { error: moveErr } = await supabase
                .from('stock_movements')
                .insert({
                  product_id: prod.id,
                  type: 'IN',
                  quantity: qty,
                  reason: `Bulk Replenishment | Size: ${sz}`
                });
              if (moveErr) throw moveErr;

              const detailsMsg = `Replenished ${qty} units of size ${sz} for SKU ${prod.sku} (${prod.color || 'N/A'}).`;
              await supabase.from('activity_logs').insert({
                action: 'STOCK_ADDED',
                details: detailsMsg
              });
            }
          }

          const newTotalStock = prod.current_stock + addedQty;

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

      showToast(`Stock replenished successfully! Logged ${totalAddedQty} units.`, 'success');
      setReplenishList([]);
      setUnmatchedCodes([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('ky_pending_replenishment');
      }
      
      const { data } = await supabase.from('products').select('*, categories(id, name)');
      if (data) setProductsCache(data);
      await fetchHistory();
    } catch (err: any) {
      showToast(err.message || 'Error updating stock levels', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportReplenishHistory = (dateTab: string) => {
    const filteredLogs = historyLogs.filter(log => getLocalDateString(log.created_at) === dateTab);
    if (filteredLogs.length === 0) {
      showToast(`No replenishment history logs found for ${dateTab} to export`, 'warning');
      return;
    }

    const wsData = filteredLogs.map((log) => {
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

    const ws = utils.json_to_sheet(wsData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Replenishments');

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
    a.download = `Replenishment_History_${dateTab}.xlsx`;
    a.click();
    showToast(`Replenishment history Excel for ${dateTab} exported!`, 'success');
  };

  const handlePrintReplenishPdf = (dateTab: string) => {
    const filteredLogs = historyLogs.filter(log => getLocalDateString(log.created_at) === dateTab);
    if (filteredLogs.length === 0) {
      showToast(`No replenishment history logs found for ${dateTab} to export`, 'warning');
      return;
    }

    const htmlRows = filteredLogs.map((log) => {
      const sizeVal = log.reason ? log.reason.split('Size:')[1]?.trim() || 'One Size' : 'One Size';
      const catName = log.products?.categories?.name || '';
      const articleCode = formatArticleCode(log.products?.sku || '', log.products?.color || '', sizeVal, catName);
      return `
        <tr>
          <td>${new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
          <td style="font-family: monospace; font-weight: bold; color: #4f46e5;">${articleCode}</td>
          <td>${log.products?.color || 'N/A'}</td>
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
            <title>Replenishment History Report - ${dateTab}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              header { display: flex; justify-content: space-between; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 20px; }
              h1 { font-size: 20px; margin: 0; color: #1e1b4b; }
              span.date { font-size: 11px; color: #666; font-weight: bold; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 11px; }
              th { background-color: #f8fafc; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
              tr:nth-child(even) { background-color: #f8fafc; }
              .total-row { font-weight: bold; background-color: #f1f5f9 !important; }
              footer { margin-top: 40px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            </style>
          </head>
          <body>
            <header>
              <div>
                <h1>Replenishment History Report</h1>
                <span class="date">Date: ${dateTab}</span>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 14px; font-weight: bold; color: #6366f1;">Saint G Inventory</span>
              </div>
            </header>
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Article Code</th>
                  <th>Color</th>
                  <th style="text-align: center;">Quantity</th>
                </tr>
              </thead>
              <tbody>
                ${htmlRows}
                <tr class="total-row">
                  <td colspan="3" style="text-align: right;">Total Replenished Units:</td>
                  <td style="text-align: center;">${filteredLogs.reduce((sum, log) => sum + Number(log.quantity || 0), 0)}</td>
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

  return (
    <div className="flex flex-col gap-6 select-none font-sans">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={excelFileInputRef}
        accept=".xlsx, .xls, .csv"
        onChange={handleExcelReorderUpload}
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-850 dark:text-white flex items-center gap-2">
            <ArrowUpRight className="w-8 h-8 text-emerald-500 bg-emerald-500/10 p-1 rounded-xl animate-pulse" />
            Stock Replenishment
          </h1>
          <p className="text-sm text-slate-500 mt-1">Bulk inbound stock adjustments by Excel file import or pasting article codes.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => excelFileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Import Excel Reorder
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Paste Inputs & Excel Import */}
        <div className="lg:col-span-1 flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-base text-slate-850 dark:text-white">Paste / Import Articles</h2>
              <p className="text-xs text-slate-400 mt-0.5">Excel Format: <code>Sr No | SKU Code | Qty</code></p>
            </div>
            <button
              onClick={() => excelFileInputRef.current?.click()}
              className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold text-xs transition-all cursor-pointer"
              title="Upload Excel File"
            >
              <Upload className="w-4 h-4" />
            </button>
          </div>

          {/* Category Dropdown Option */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Select Category (Required)</label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <option value="">-- Select Category --</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id} className="dark:bg-slate-900">{cat.name}</option>
              ))}
            </select>
          </div>

          <textarea
            className="w-full h-44 p-3 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder:text-slate-400"
            placeholder="e.g.&#10;sg-f-1732-black 1 2 1 1 1 1&#10;sg-f-1732-black 37eu"
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleLoadArticles}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Clipboard className="w-4 h-4" />}
              Load Text
            </button>

            <button
              onClick={() => excelFileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Import Excel
            </button>
          </div>

          {/* Unmatched Codes Alert */}
          {unmatchedCodes.length > 0 && (
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-500 space-y-2 animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                <AlertCircle className="w-4.5 h-4.5" />
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
        </div>

        {/* Right Side: Replenish Grid Table */}
        <div className="lg:col-span-2 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
          <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-850">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <h2 className="font-extrabold text-base tracking-tight text-slate-850 dark:text-white">Replenishment List</h2>
            </div>
            {replenishList.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg transition-all"
              >
                Clear List
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]">
            {replenishList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-6">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 border border-slate-250/50 dark:border-slate-850">
                  <ArrowUpRight className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-bold text-slate-700 dark:text-slate-300 text-sm">List is Empty</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">Paste article codes with quantities on the left and click "Load Articles" to populate your replenishment list.</p>
              </div>
            ) : (
              replenishList.map((item) => {
                const prod = item.product;
                const catName = getCatName(prod.categories);
                const sizes = getCategorySizesByName(catName);
                const totalItemAdded = Object.values(item.addedStocks).reduce((sum, q) => sum + Number(q || 0), 0);

                return (
                  <div key={prod.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 px-2 py-0.5 rounded">
                            {prod.sku}
                          </span>
                          <span className="text-xs font-bold text-slate-500">{prod.color}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-850 dark:text-slate-100 mt-1">{prod.name || 'Unnamed Article'}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Category: {catName} | Current Stock: {prod.current_stock}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(prod.id)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-95"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Size Inputs Grid */}
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-2 border-t border-slate-200/40 dark:border-slate-800/40">
                      {sizes.map((sz) => (
                        <div key={sz} className="flex flex-col items-center p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-center">
                          <span className="text-[9px] font-bold text-slate-400">Sz {sz}</span>
                          <input
                            type="number"
                            min="0"
                            className="w-full text-center bg-transparent border-none p-0 focus:ring-0 font-extrabold text-xs text-indigo-600 dark:text-indigo-400 mt-0.5"
                            value={item.addedStocks[sz] || ''}
                            onChange={(e) => handleSizeQtyChange(prod.id, sz, parseInt(e.target.value) || 0)}
                          />
                        </div>
                      ))}

                      {/* Item Total */}
                      <div className="flex flex-col items-center justify-center p-1.5 rounded bg-emerald-500/5 border border-emerald-500/10 text-center">
                        <span className="text-[9px] font-bold text-emerald-500">Added</span>
                        <span className="font-extrabold text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">+{totalItemAdded}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {replenishList.length > 0 && (
            <div className="p-5 border-t border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grand Total Pieces:</span>
                <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-xl">
                  {replenishList.reduce((sum, item) => sum + Object.values(item.addedStocks).reduce((s, q) => s + Number(q || 0), 0), 0)}
                </span>
              </div>
              <button
                onClick={handleConfirmReplenish}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                Confirm Replenishment
              </button>
            </div>
          )}
        </div>

      </div>

      {/* History Log Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" />
            <h2 className="font-extrabold text-base tracking-tight text-slate-850 dark:text-white">Recent Replenishments History</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportReplenishHistory(selectedHistoryTab)}
              disabled={historyLogs.filter(log => getLocalDateString(log.created_at) === selectedHistoryTab).length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button
              onClick={() => handlePrintReplenishPdf(selectedHistoryTab)}
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
            const logCount = historyLogs.filter(log => getLocalDateString(log.created_at) === dateTab).length;
            
            return (
              <button
                key={dateTab}
                onClick={() => setSelectedHistoryTab(dateTab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
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
          <div className="py-12 text-center text-xs text-slate-400">No stock replenishments recorded on {selectedHistoryTab}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Article Code</th>
                  <th className="py-3 px-4">Article Details</th>
                  <th className="py-3 px-4 text-center">Quantity</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {historyLogs
                  .filter(log => getLocalDateString(log.created_at) === selectedHistoryTab)
                  .map((log) => {
                    const sizeVal = log.reason ? log.reason.split('Size:')[1]?.trim() || 'One Size' : 'One Size';
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
                        <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {articleCode}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{log.products?.name || 'Unnamed'}</div>
                          <div className="text-[10px] text-slate-400 font-medium">Color: {log.products?.color || 'N/A'}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            +{log.quantity}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-medium">{log.reason}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EXCEL REORDER IMPORT REVIEW MODAL */}
      <Modal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        title="📊 Review Excel Reorder Import"
      >
        <div className="space-y-4 font-sans select-none text-slate-800 dark:text-slate-100">
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {excelRows.filter(r => r.status === 'matched').length} / {excelRows.length} Items Matched
              </div>
              <div className="text-xs text-slate-400 font-medium">Format: Sr. No | Article Code (sg-f-1732-red-36eu) | Quantity</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black text-emerald-500">
                {excelRows.filter(r => r.status === 'matched').reduce((sum, r) => sum + r.rawQty, 0)} Pairs
              </div>
              <div className="text-xs text-slate-400 font-bold uppercase">Total Reorder Pairs</div>
            </div>
          </div>

          {/* Table of Parsed Excel Rows */}
          <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-extrabold sticky top-0">
                  <th className="py-2.5 px-3">Sr. No</th>
                  <th className="py-2.5 px-3">Excel SKU Code</th>
                  <th className="py-2.5 px-3">Parsed Size</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                {excelRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-bold text-slate-400">{r.srNo}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.rawSku}</td>
                    <td className="py-2.5 px-3 font-bold">Size {r.parsedSize}</td>
                    <td className="py-2.5 px-3 text-center font-black text-slate-900 dark:text-white">{r.rawQty}</td>
                    <td className="py-2.5 px-3 text-right">
                      {r.matchedProduct ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                          ✓ Ready
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 border border-rose-500/20 text-rose-500">
                          ⚠ Unmatched
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setIsExcelModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmExcelImport}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Confirm & Import to Replenishment List
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
