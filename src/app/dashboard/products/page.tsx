'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui/toast';
import { read, write, utils } from 'xlsx';
import Modal from '@/components/ui/modal';
import { 
  Plus, 
  Search, 
  Download, 
  Upload, 
  Edit3, 
  Trash2, 
  TrendingUp, 
  Barcode as BarcodeIcon, 
  RefreshCw,
  ShoppingBag,
  HelpCircle,
  FileSpreadsheet,
  Play,
  CheckCircle2,
  XCircle
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  brand: string;
  color: string;
  size: string; // Left for compatibility
  rack_location: string;
  size_stocks: Record<string, number>; // JSONB map
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  minimum_stock_alert: number;
  barcode: string;
  image_url: string;
  notes: string;
  created_at: string;
  categories?: Category;
}

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

const getColorCssValue = (colorName: string): string => {
  const name = colorName.toLowerCase().trim().replace(/[-\s]+/g, '');
  
  const customMap: Record<string, string> = {
    'offwhite': '#f5f5f0',
    'off-white': '#f5f5f0',
    'tan': '#d2b48c',
    'nude': '#f5f5dc',
    'beige': '#f5f5dc',
    'multi': 'linear-gradient(45deg, red, yellow, blue)',
    'multicolor': 'linear-gradient(45deg, red, yellow, blue)',
    'snakeskin': '#c2b280',
    'cheetah': '#d2b48c',
    'leopard': '#b8860b',
  };

  return customMap[name] || name;
};

const getCategorySizesByName = (catName: string): string[] => {
  if (!catName) return ['One Size'];
  if (SIZE_PRESETS[catName]) return SIZE_PRESETS[catName];
  
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

const getGoogleSheetCsvUrl = (url: string): string | null => {
  try {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return null;
    const spreadsheetId = match[1];
    
    const gidMatch = url.match(/gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : null;
    
    let csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    if (gid) {
      csvUrl += `&gid=${gid}`;
    }
    return csvUrl;
  } catch (e) {
    return null;
  }
};

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentValue = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentValue += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentValue.trim());
        currentValue = '';
      } else if (char === '\r' || char === '\n') {
        row.push(currentValue.trim());
        currentValue = '';
        if (row.some(val => val !== '')) {
          lines.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentValue += char;
      }
    }
  }

  if (currentValue || row.length > 0) {
    row.push(currentValue.trim());
    if (row.some(val => val !== '')) {
      lines.push(row);
    }
  }

  return lines;
}

const normalizeCode = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/^(sg-?)+/gi, '') // remove leading sg- or sg
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
};

const findProductMatch = (code: string, productsList: Product[]): Product | null => {
  const codeNorm = normalizeCode(code);
  if (!codeNorm) return null;

  return productsList.find(p => {
    const cleanSku = normalizeCode(p.sku);
    const cleanBarcode = normalizeCode(p.barcode || '');
    return codeNorm === cleanSku || codeNorm === cleanBarcode;
  }) || null;
};

const APPS_SCRIPT_CODE = `function normalizeCode(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/^(sg-?)+/gi, '') // remove leading sg- or sg
    .replace(/\\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function syncInventory(payload) {
  const SUPABASE_URL = "https://pruqqfaqrktypruwoprn.supabase.co";
  const SUPABASE_KEY = "sb_publishable_WVmBt5uObdoo-DF2k2aUcA_Kuf-TWhV";
  
  Logger.log("Fetching products from database...");
  const url = \`\${SUPABASE_URL}/rest/v1/products?select=sku,color,barcode,current_stock,size_stocks,categories(name)&order=sku.asc\`;
  
  const response = UrlFetchApp.fetch(url, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY
    }
  });
  
  const products = JSON.parse(response.getContentText());
  Logger.log(\`Fetched \${products.length} products.\`);
  
  var spreadsheetUrl = payload && payload.spreadsheetUrl;
  var spreadsheetId = payload && payload.spreadsheetId;
  var ss = null;
  
  if (spreadsheetUrl) {
    try {
      var match = spreadsheetUrl.match(/\\/d\\/([a-zA-Z0-9-_]+)/);
      if (match) {
        var id = match[1];
        ss = SpreadsheetApp.openById(id);
        PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", id);
        Logger.log("Opened spreadsheet by URL and saved ID: " + id);
      }
    } catch (e) {
      Logger.log("Error opening by URL: " + e.toString());
    }
  } else if (spreadsheetId) {
    try {
      ss = SpreadsheetApp.openById(spreadsheetId);
      PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", spreadsheetId);
      Logger.log("Opened spreadsheet by ID and saved ID: " + spreadsheetId);
    } catch (e) {
      Logger.log("Error opening by ID: " + e.toString());
    }
  }
  
  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      Logger.log("getActiveSpreadsheet failed: " + e.toString());
    }
  }
  
  if (!ss) {
    try {
      var savedId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
      if (savedId) {
        ss = SpreadsheetApp.openById(savedId);
        Logger.log("Opened spreadsheet by saved ID: " + savedId);
      }
    } catch (e) {
      Logger.log("Error opening by saved ID: " + e.toString());
    }
  }
  
  if (!ss) {
    throw new Error(
      "Spreadsheet context not found. If this is a standalone script (run from script.google.com), " +
      "please configure the Sheet URL in the web dashboard and perform a push to link it, " +
      "or verify script permissions."
    );
  }
  
  // Size presets mapping
  const SIZE_PRESETS = {
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
  
  // Group products by category and build inventoryQtyMap for Sales History Status
  const categoriesMap = {};
  const inventoryQtyMap = {};
  
  products.forEach(p => {
    let catName = "Uncategorized";
    if (p.categories) {
      catName = p.categories.name || "Uncategorized";
    }
    // Normalize category name for winter boots
    if (catName.toLowerCase().includes("winter boot")) {
      catName = "Winter Boot";
    }
    if (!categoriesMap[catName]) {
      categoriesMap[catName] = [];
    }
    categoriesMap[catName].push(p);
    
    // Add size stocks to map
    var skuNorm = normalizeCode(p.sku);
    var colorNorm = normalizeCode(p.color);
    var sizeStocks = p.size_stocks || {};
    
    for (var sizeKey in sizeStocks) {
      var sizeNorm = normalizeCode(sizeKey);
      var qty = Number(sizeStocks[sizeKey]) || 0;
      var key = skuNorm + '|' + colorNorm + '|' + sizeNorm;
      inventoryQtyMap[key] = qty;
    }
    if (p.size) {
      var sizeNorm = normalizeCode(p.size);
      var qty = Number(p.current_stock) || 0;
      var key = skuNorm + '|' + colorNorm + '|' + sizeNorm;
      inventoryQtyMap[key] = qty;
    }
  });
  
  // Categories order
  const categoriesOrder = [
    'Women Footwear',
    'Winter Boot',
    'Mens Footwear',
    'Mens Jacket',
    'Apparels',
    'Shades',
    'Bags',
    'Gift Bag',
    'Uncategorized'
  ];
  
  // Process each category
  categoriesOrder.forEach(catName => {
    const prods = categoriesMap[catName];
    if (!prods || prods.length === 0) return;
    
    let sheet = ss.getSheetByName(catName);
    if (!sheet) {
      sheet = ss.insertSheet(catName);
    } else {
      sheet.clear();
    }
    
    // Set gridlines visible
    sheet.setHiddenGridlines(false);
    
    const sizes = SIZE_PRESETS[catName] || ['One Size'];
    const numSizes = sizes.length;
    
    // Headers
    const headers1 = ["Sr No.", "SKU", "SIZES"];
    for (let i = 1; i < numSizes; i++) {
      headers1.push("");
    }
    headers1.push("TOTAL");
    
    const headers2 = ["", ""];
    sizes.forEach(sz => headers2.push(sz));
    headers2.push("");
    
    const rows = [headers1, headers2];
    
    // Add product rows
    prods.forEach((p, idx) => {
      const sku = p.sku;
      const sizeStocks = p.size_stocks || {};
      
      const row = [idx + 1, sku];
      let rowTotal = 0;
      sizes.forEach(sz => {
        const qty = Number(sizeStocks[sz]) || 0;
        rowTotal += qty;
        row.push(qty); // Output zero, don't leave empty
      });
      row.push(rowTotal);
      rows.push(row);
    });
    
    // Add total row
    const totalRow = ["", "TOTAL"];
    const colTotals = Array(numSizes).fill(0);
    let grandTotal = 0;
    
    prods.forEach(p => {
      const sizeStocks = p.size_stocks || {};
      sizes.forEach((sz, idx) => {
        const qty = Number(sizeStocks[sz]) || 0;
        colTotals[idx] += qty;
        grandTotal += qty;
      });
    });
    
    colTotals.forEach(t => totalRow.push(t > 0 ? t : 0));
    totalRow.push(grandTotal);
    rows.push(totalRow);
    
    // Write data to sheet
    const range = sheet.getRange(1, 1, rows.length, 3 + numSizes);
    range.setValues(rows);
    
    // Format headers
    sheet.getRange(1, 1, 2, 3 + numSizes).setFontWeight("bold");
    sheet.getRange(1, 1, 2, 3 + numSizes).setBackground("#E2EFDA"); // Light green background
    sheet.getRange(1, 1, 2, 3 + numSizes).setHorizontalAlignment("center");
    
    // Merge SIZES header across size columns
    sheet.getRange(1, 3, 1, numSizes).merge();
    
    // Format product rows text alignment
    sheet.getRange(3, 1, prods.length, 1).setHorizontalAlignment("center");
    sheet.getRange(3, 3, prods.length + 1, numSizes + 1).setHorizontalAlignment("center");
    
    // Format total row
    const lastRowIdx = rows.length;
    sheet.getRange(lastRowIdx, 1, 1, 3 + numSizes).setFontWeight("bold");
    sheet.getRange(lastRowIdx, 1, 1, 3 + numSizes).setBackground("#D9E1F2"); // Light blue background
    
    // Set borders
    range.setBorder(true, true, true, true, true, true, "#BFBFBF", SpreadsheetApp.BorderStyle.SOLID);
    
    // Auto fit column widths
    for (let c = 1; c <= 3 + numSizes; c++) {
      sheet.autoResizeColumn(c);
      // Add padding
      const width = sheet.getColumnWidth(c);
      sheet.setColumnWidth(c, width + 15);
    }

    // Apply conditional formatting on category quantity columns
    var catRules = [];
    for (var i = 0; i < numSizes; i++) {
      var sz = sizes[i];
      var colIdx = 3 + i;
      var colRange = sheet.getRange(3, colIdx, prods.length, 1);
      
      var is37 = (sz === '37' || sz === '37eu' || sz === '37EU');
      var isMens41 = (catName === 'Mens Footwear' && sz === '41');
      var yellowThreshold = (is37 || isMens41) ? 3 : 2;
      
      var yellowRule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThanOrEqualTo(yellowThreshold)
        .setBackground("#FFF2CC") // Light yellow background
        .setFontColor("#7F6000") // Dark yellow/brownish text
        .setBold(true)
        .setRanges([colRange])
        .build();
        
      var greenRule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThanOrEqualTo(1)
        .setBackground("#E2EFDA") // Light green background
        .setFontColor("#375623") // Dark green text
        .setBold(true)
        .setRanges([colRange])
        .build();

      var redRule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThanOrEqualTo(0)
        .setBackground("#FCE4D6") // Light red/orange background
        .setFontColor("#C65911") // Dark red/orange text
        .setRanges([colRange])
        .build();
        
      catRules.push(yellowRule, greenRule, redRule);
    }
    sheet.setConditionalFormatRules(catRules);
  });
  
  // Remove default "Sheet1" if it's empty
  const sheet1 = ss.getSheetByName("Sheet1");
  if (sheet1 && sheet1.getLastRow() <= 1 && sheet1.getLastColumn() <= 1 && ss.getSheets().length > 1) {
    ss.deleteSheet(sheet1);
  }

  // --- 1. Process __InventoryCache Sheet (Hidden) ---
  var cacheSheet = ss.getSheetByName("__InventoryCache");
  if (!cacheSheet) {
    cacheSheet = ss.insertSheet("__InventoryCache");
    cacheSheet.hideSheet();
  }
  cacheSheet.clearContents();
  
  // Cache only combinations that have valid received stock:
  // For size '37' (or '37eu'), quantity must be >= 2. For others, quantity > 0.
  var cacheValues = [];
  for (var key in inventoryQtyMap) {
    var parts = key.split('|');
    var sizeNorm = parts[2];
    var qty = inventoryQtyMap[key];
    
    var isReceived = false;
    if (sizeNorm === '37' || sizeNorm === '37eu') {
      isReceived = (qty >= 2);
    } else {
      isReceived = (qty > 0);
    }
    
    if (isReceived) {
      cacheValues.push([key]);
    }
  }
  if (cacheValues.length > 0) {
    cacheSheet.getRange(1, 1, cacheValues.length, 1).setValues(cacheValues);
  }

  // --- 2. Process Sales History Sheet ---
  var salesSheet = ss.getSheetByName("Sales History");
  if (!salesSheet) {
    salesSheet = ss.insertSheet("Sales History");
  }

  // Set gridlines visible
  salesSheet.setHiddenGridlines(false);

  // If there's an existing "Location" column, delete it immediately
  if (salesSheet.getLastColumn() > 0) {
    var headers = salesSheet.getRange(1, 1, 1, salesSheet.getLastColumn()).getValues()[0];
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim().toLowerCase() === "location") {
        salesSheet.deleteColumn(c + 1);
        break;
      }
    }
  }

  // Check/create headers
  if (salesSheet.getLastRow() === 0) {
    salesSheet.appendRow(["Sell Date", "SKU Code", "Color", "Size", "Status"]);
  }
  salesSheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#F2F2F2").setHorizontalAlignment("center");

  // Apply Conditional Formatting for Status (Col E)
  setupConditionalFormatting(salesSheet);

  // --- 3. Fetch past 15 days' sales from Supabase and write/sync ---
  var dbSalesRows = [];
  try {
    var fifteenDaysAgoObj = new Date();
    fifteenDaysAgoObj.setDate(fifteenDaysAgoObj.getDate() - 15);
    var startOfPeriod = new Date(fifteenDaysAgoObj.getFullYear(), fifteenDaysAgoObj.getMonth(), fifteenDaysAgoObj.getDate()).toISOString();
    
    // Fetch past 15 days' sale_items
    var salesUrl = \`\${SUPABASE_URL}/rest/v1/sale_items?select=product_id,size,quantity,selling_price,created_at,sales(id,sale_date),products(sku,color)&created_at=gte.\${encodeURIComponent(startOfPeriod)}\`;
    var salesResponse = UrlFetchApp.fetch(salesUrl, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY
      }
    });
    var saleItems = JSON.parse(salesResponse.getContentText());

    // Fetch past 15 days' stock movements to determine location and filter warehouse sales
    var movementsUrl = \`\${SUPABASE_URL}/rest/v1/stock_movements?select=product_id,reason,created_at&type=eq.OUT&created_at=gte.\${encodeURIComponent(startOfPeriod)}\`;
    var movementsResponse = UrlFetchApp.fetch(movementsUrl, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY
      }
    });
    var stockMovements = JSON.parse(movementsResponse.getContentText());

    // Map sale items to array
    saleItems.forEach(item => {
      var isWarehouseSold = false;
      var saleId = (item.sales && item.sales.id) ? item.sales.id : '';
      
      for (var m = 0; m < stockMovements.length; m++) {
        var sm = stockMovements[m];
        if (sm.product_id === item.product_id) {
          if (saleId && sm.reason && sm.reason.indexOf(saleId) !== -1) {
            if (sm.reason.toLowerCase().indexOf('sold from warehouse') !== -1) {
              isWarehouseSold = true;
              break;
            }
          }
        }
      }

      // Skip sales made from "Sold from Warehouse" button
      if (isWarehouseSold) {
        return;
      }

      var saleDateRaw = (item.sales && item.sales.sale_date) ? item.sales.sale_date : item.created_at;
      var saleDate = new Date(saleDateRaw);
      var day = String(saleDate.getDate()).padStart(2, '0');
      var month = String(saleDate.getMonth() + 1).padStart(2, '0');
      var year = saleDate.getFullYear();
      var dateStr = day + "-" + month + "-" + year;

      dbSalesRows.push([
        dateStr,
        (item.products && item.products.sku) ? item.products.sku : 'N/A',
        (item.products && item.products.color) ? item.products.color : 'N/A',
        item.size || 'N/A',
        "" // Status filled below
      ]);
    });
  } catch (err) {
    Logger.log("Error fetching sales: " + err.toString());
  }

  // Update Sales History with past 15 days of sales (no older sales)
  var existingRows = salesSheet.getDataRange().getValues();
  var dataRows = [];

  // Build a set of DB sales keys to avoid duplicate manual rows
  var dbSalesKeys = {};
  dbSalesRows.forEach(row => {
    var key = row[0] + '|' + normalizeCode(row[1]) + '|' + normalizeCode(row[2]) + '|' + normalizeCode(row[3]);
    dbSalesKeys[key] = true;
  });

  // Detect if the existing sheet had the "Location" column (6 columns) or not (5 columns)
  var hasLocationCol = false;
  if (existingRows.length > 0 && existingRows[0].length >= 6 && String(existingRows[0][1]).toLowerCase() === "location") {
    hasLocationCol = true;
  }

  // Keep manually entered rows that are within the last 15 days and not already in Supabase dbSalesRows
  for (var r = 1; r < existingRows.length; r++) {
    var row = existingRows[r];
    var rowDateVal = row[0];
    
    var rowSku = "";
    var rowColor = "";
    var rowSize = "";
    var rowStatus = "";
    
    if (hasLocationCol) {
      rowSku = String(row[2]).trim();
      rowColor = String(row[3]).trim();
      rowSize = String(row[4]).trim();
      rowStatus = String(row[5]).trim();
    } else {
      rowSku = String(row[1]).trim();
      rowColor = String(row[2]).trim();
      rowSize = String(row[3]).trim();
      rowStatus = String(row[4]).trim();
    }
    
    var rowDateStr = "";
    if (rowDateVal instanceof Date) {
      var day = String(rowDateVal.getDate()).padStart(2, '0');
      var month = String(rowDateVal.getMonth() + 1).padStart(2, '0');
      var year = rowDateVal.getFullYear();
      rowDateStr = day + "-" + month + "-" + year;
    } else {
      rowDateStr = String(rowDateVal).trim();
    }
    
    var rowKey = rowDateStr + '|' + normalizeCode(rowSku) + '|' + normalizeCode(rowColor) + '|' + normalizeCode(rowSize);
    if (isWithinLast15Days(rowDateVal) && !dbSalesKeys[rowKey]) {
      dataRows.push([
        rowDateStr,
        rowSku,
        rowColor,
        rowSize,
        rowStatus
      ]);
    }
  }

  // Append database sales
  dbSalesRows.forEach(row => dataRows.push(row));

  // Sort all dataRows date-wise ascending (oldest first)
  dataRows.sort(function(a, b) {
    return parseDate(a[0]) - parseDate(b[0]);
  });

  var newRows = [["Sell Date", "SKU Code", "Color", "Size", "Status"]];
  newRows = newRows.concat(dataRows);

  // Write back to sales sheet (this removes sales older than 15 days)
  salesSheet.clear();
  var maxCols = salesSheet.getMaxColumns();
  if (maxCols > 5) {
    salesSheet.deleteColumns(6, maxCols - 5);
  }
  salesSheet.getRange(1, 1, newRows.length, 5).setValues(newRows);
  
  // Re-apply header formatting and conditional formatting
  salesSheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#F2F2F2");
  setupConditionalFormatting(salesSheet);

  // --- 4. Update Status for all rows in Sales History ---
  var lastRow = salesSheet.getLastRow();
  if (lastRow > 1) {
    var dataRange = salesSheet.getRange(2, 2, lastRow - 1, 3); // Cols B, C, D (SKU, Color, Size)
    var rowsData = dataRange.getValues();
    var statusValues = [];

    for (var r = 0; r < rowsData.length; r++) {
      var rowSku = String(rowsData[r][0]).trim();
      var rowColor = String(rowsData[r][1]).trim();
      var rowSize = String(rowsData[r][2]).trim();

      if (!rowSku && !rowColor && !rowSize) {
        statusValues.push([""]);
      } else {
        var sizeNorm = normalizeCode(rowSize);
        var key = normalizeCode(rowSku) + '|' + normalizeCode(rowColor) + '|' + sizeNorm;
        var stockQty = inventoryQtyMap[key] || 0;
        
        var isReceived = false;
        if (sizeNorm === '37' || sizeNorm === '37eu' || sizeNorm === '37EU') {
          isReceived = (stockQty >= 2);
        } else {
          isReceived = (stockQty > 0);
        }
        
        if (isReceived) {
          statusValues.push(["🟢 Received"]);
        } else {
          statusValues.push(["🔴 Not Received"]);
        }
      }
    }
    salesSheet.getRange(2, 5, statusValues.length, 1).setValues(statusValues); // Col E (Status)
  }

  // Auto fit Sales History columns
  for (let c = 1; c <= 5; c++) {
    salesSheet.autoResizeColumn(c);
    const width = salesSheet.getColumnWidth(c);
    salesSheet.setColumnWidth(c, width + 15);
  }
  
  Logger.log("Inventory sync complete!");
}

function getTodayDateString() {
  var today = new Date();
  var day = String(today.getDate()).padStart(2, '0');
  var month = String(today.getMonth() + 1).padStart(2, '0');
  var year = today.getFullYear();
  return day + "-" + month + "-" + year;
}

function parseDate(dateVal) {
  if (!dateVal) return new Date(0);
  if (dateVal instanceof Date || (dateVal && typeof dateVal.getFullYear === 'function')) {
    return new Date(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate());
  }
  var str = String(dateVal).trim();
  // Replace slashes and dots with hyphens using split and join to avoid regex escape issues
  var cleanStr = str.split('/').join('-').split('.').join('-');
  var parts = cleanStr.split('-');
  if (parts.length === 3) {
    var p0 = parseInt(parts[0], 10);
    var p1 = parseInt(parts[1], 10);
    var p2 = parseInt(parts[2], 10);
    if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      if (p0 > 1000) {
        // Format: YYYY-MM-DD
        return new Date(p0, p1 - 1, p2);
      } else if (p2 > 1000) {
        // Format: DD-MM-YYYY
        return new Date(p2, p1 - 1, p0);
      } else {
        // Format: DD-MM-YY, assume 2000 + YY
        var year = p2 < 100 ? 2000 + p2 : p2;
        return new Date(year, p1 - 1, p0);
      }
    }
  }
  // Fallback to JavaScript built-in parser
  var d = new Date(str);
  if (!isNaN(d.getTime())) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return new Date(0);
}

function isWithinLast15Days(rowDateVal) {
  if (!rowDateVal) return false;
  var rowDate = parseDate(rowDateVal);
  if (rowDate.getTime() === new Date(0).getTime()) return false;
  
  var today = new Date();
  var todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  var diffTime = todayStart - rowDate;
  var diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  // Keep if it is 15 days or less old.
  // Note: if diffDays is negative (future date due to timezone differences), we also keep it.
  return diffDays <= 15;
}

function setupConditionalFormatting(sheet) {
  sheet.clearConditionalFormatRules();
  var range = sheet.getRange("E2:E");
  
  var ruleReceived = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("🟢 Received")
    .setBackground("#dcfce7") // Light green background
    .setFontColor("#15803d") // Dark green text
    .setBold(true)
    .setRanges([range])
    .build();
    
  var ruleNotReceived = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("🔴 Not Received")
    .setBackground("#fee2e2") // Light red background
    .setFontColor("#b91c1c") // Dark red text
    .setBold(true)
    .setRanges([range])
    .build();
    
  sheet.setConditionalFormatRules([ruleReceived, ruleNotReceived]);
}

function onEdit(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    if (sheet.getName() === "Sales History") {
      var startRow = range.getRow();
      var numRows = range.getNumRows();
      var startCol = range.getColumn();
      var numCols = range.getNumCols();
      
      var overlaps = false;
      for (var c = startCol; c < startCol + numCols; c++) {
        if (c === 2 || c === 3 || c === 4) {
          overlaps = true;
          break;
        }
      }
      
      if (overlaps) {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var cacheSheet = ss.getSheetByName("__InventoryCache");
        var inventorySet = {};
        if (cacheSheet) {
          var lastCacheRow = cacheSheet.getLastRow();
          if (lastCacheRow > 0) {
            var cacheValues = cacheSheet.getRange(1, 1, lastCacheRow, 1).getValues();
            for (var i = 0; i < cacheValues.length; i++) {
              var val = String(cacheValues[i][0]).trim();
              if (val) {
                inventorySet[val] = true;
              }
            }
          }
        }
        
        function normalizeCode(str) {
          if (!str) return '';
          return String(str)
            .toLowerCase()
            .trim()
            .replace(/^(sg-?)+/gi, '')
            .replace(/\\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        }
        
        var endRow = startRow + numRows - 1;
        for (var r = startRow; r <= endRow; r++) {
          if (r > 1) {
            var sku = String(sheet.getRange(r, 2).getValue()).trim();
            var color = String(sheet.getRange(r, 3).getValue()).trim();
            var size = String(sheet.getRange(r, 4).getValue()).trim();
            
            if (!sku && !color && !size) {
              sheet.getRange(r, 5).setValue("");
            } else {
              var key = normalizeCode(sku) + '|' + normalizeCode(color) + '|' + normalizeCode(size);
              // Cache contains only combinations where quantity > 0 (or >=2 for 37)
              if (inventorySet[key]) {
                sheet.getRange(r, 5).setValue("🟢 Received");
              } else {
                sheet.getRange(r, 5).setValue("🔴 Not Received");
              }
            }
          }
        }
      }
    }
  } catch (err) {
    // Fail silently
  }
}

function doGet(e) {
  try {
    var payload = {};
    if (e && e.parameter) {
      payload = e.parameter;
    }
    syncInventory(payload);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Inventory sync complete" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        Logger.log("Error parsing POST body: " + parseErr.toString());
      }
    }
    syncInventory(payload);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Inventory sync complete" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
`;

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedColorFilter, setSelectedColorFilter] = useState<string>('all');
  const [selectedSizeFilter, setSelectedSizeFilter] = useState<string>('all');

  // Sold From Warehouse Modal state
  const [isWarehouseSoldOpen, setIsWarehouseSoldOpen] = useState(false);
  const [warehouseSku, setWarehouseSku] = useState('');
  const [warehouseSize, setWarehouseSize] = useState('');
  const [warehousePrice, setWarehousePrice] = useState('');
  const [warehouseSubmitting, setWarehouseSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('filter') === 'lowStock') {
        setStockFilter('low');
      }
            const savedUrl = localStorage.getItem('ky_apps_script_url');
      if (savedUrl) setAppsScriptUrl(savedUrl);
      const savedSheetUrl = localStorage.getItem('ky_sheet_url');
      if (savedSheetUrl) setSheetUrl(savedSheetUrl);
    }
  }, []);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSellOpen, setIsSellOpen] = useState(false);
  
  // Active Form Operations
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [activeProductId, setActiveProductId] = useState('');

  // Google Sheet Sync State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [syncStep, setSyncStep] = useState<'input' | 'preview' | 'syncing' | 'complete'>('input');
  const [syncOption, setSyncOption] = useState<'pull' | 'push'>('pull');
  const [appsScriptUrl, setAppsScriptUrl] = useState('');
  const [pushingToSheet, setPushingToSheet] = useState(false);
  const [previewItems, setPreviewItems] = useState<{
    id: string;
    sku: string;
    name: string;
    categoryName: string;
    oldStock: number;
    newStock: number;
    oldSizeStocks: Record<string, number>;
    newSizeStocks: Record<string, number>;
    status: 'overwrite' | 'no_change' | 'not_found' | 'invalid_sizes';
    errorMessage?: string;
  }[]>([]);
  const [syncProgress, setSyncProgress] = useState({
    total: 0,
    current: 0,
    success: 0,
    error: 0,
    log: [] as string[]
  });

  // Excel Inventory Import State
  const [importParsedArticles, setImportParsedArticles] = useState<{
    sku: string;
    categoryName: string;
    sizeStocks: Record<string, number>;
    totalPairs: number;
    color?: string;
  }[]>([]);
  const [importCategorySummaries, setImportCategorySummaries] = useState<{
    categoryName: string;
    articleCount: number;
    totalPairs: number;
  }[]>([]);
  const [isImportConfirmModalOpen, setIsImportConfirmModalOpen] = useState(false);
  const [importingState, setImportingState] = useState(false);

  // Add/Edit Form Fields
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('KY');
  const [color, setColor] = useState('');
  const [rackLocation, setRackLocation] = useState('');
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [sizeStocks, setSizeStocks] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [displaySize, setDisplaySize] = useState('');

  // Sell Form Fields
  const [sellProduct, setSellProduct] = useState<Product | null>(null);
  const [sellSize, setSellSize] = useState('');
  const [sellPrice, setSellPrice] = useState(0);
  const [sellingSubmitting, setSellingSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch categories
      const { data: catData, error: catErr } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      if (catErr) throw catErr;
      setCategories(catData || []);

      // Fetch products
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('*, categories(id, name)')
        .order('created_at', { ascending: false });
      if (prodErr) throw prodErr;
      
      setProducts(prodData || []);
    } catch (err: any) {
      showToast(err.message || 'Error loading inventory catalog', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportInventory = () => {
    const wb = utils.book_new();
    const categoriesList = [
      'Women Footwear',
      'Winter Boot',
      'Mens Footwear',
      'Mens Jacket',
      'Apparels',
      'Shades',
      'Bags',
      'Gift Bag'
    ];

    const grouped: Record<string, Product[]> = {};
    categoriesList.forEach(cat => { grouped[cat] = []; });
    grouped['Uncategorized'] = [];

    products.forEach(p => {
      let catName = p.categories?.name || 'Uncategorized';
      if (catName.toLowerCase().includes('winter boot')) {
        catName = 'Winter Boot';
      }
      if (grouped[catName]) {
        grouped[catName].push(p);
      } else {
        grouped['Uncategorized'].push(p);
      }
    });

    categoriesList.concat(['Uncategorized']).forEach(catName => {
      const catProds = grouped[catName];
      if (!catProds || catProds.length === 0) return;

      const sizes = SIZE_PRESETS[catName] || ['One Size'];
      const numSizes = sizes.length;

      const row1 = ["Sr No.", "SKU", "SIZES"];
      for (let i = 1; i < numSizes; i++) {
        row1.push("");
      }
      row1.push("DISPLAY");
      row1.push("TOTAL");

      const row2 = ["", ""];
      sizes.forEach(sz => row2.push(sz));
      row2.push(""); // DISPLAY placeholder
      row2.push(""); // TOTAL placeholder

      const wsData = [row1, row2];

      catProds.forEach((p, idx) => {
        const sizeStocks = p.size_stocks || {};
        const row = [String(idx + 1), p.sku];
        let rowTotal = 0;
        sizes.forEach(sz => {
          const qty = Number(sizeStocks[sz]) || 0;
          rowTotal += qty;
          row.push(String(qty));
        });
        row.push(p.size || "");
        row.push(String(rowTotal));
        wsData.push(row);
      });

      const totalRow = ["", "TOTAL"];
      const colTotals = Array(numSizes).fill(0);
      let grandTotal = 0;

      catProds.forEach(p => {
        const sizeStocks = p.size_stocks || {};
        sizes.forEach((sz, idx) => {
          const qty = Number(sizeStocks[sz]) || 0;
          colTotals[idx] += qty;
          grandTotal += qty;
        });
      });

      colTotals.forEach(t => totalRow.push(t > 0 ? String(t) : "0"));
      totalRow.push(""); // DISPLAY placeholder
      totalRow.push(String(grandTotal));
      wsData.push(totalRow);

      const ws = utils.aoa_to_sheet(wsData);
      
      const maxColWidths = wsData[0].map((_, colIndex) => {
        return Math.max(...wsData.map(row => (row[colIndex] ? String(row[colIndex]).length : 0))) + 3;
      });
      ws['!cols'] = maxColWidths.map(w => ({ wch: w }));

      const safeSheetName = catName.slice(0, 31).replace(/[\[\]\*\?\/\\:]/g, '');
      utils.book_append_sheet(wb, ws, safeSheetName);
    });

    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `KY_Inventory_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    showToast('Inventory Excel exported successfully!', 'success');
  };

  // Handle Excel Inventory File Selection & Parsing
  const handleExcelInventoryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    try {
      showToast(`Processing ${file.name}...`, 'info');
      const arrayBuffer = await file.arrayBuffer();
      const wb = read(arrayBuffer, { type: 'array' });

      if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('Invalid Excel file format or no sheets found');
      }

      const allArticles: {
        sku: string;
        categoryName: string;
        sizeStocks: Record<string, number>;
        totalPairs: number;
        color?: string;
      }[] = [];

      const categoryMap: Record<string, { articleCount: number; totalPairs: number }> = {};

      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        if (!ws) return;

        const rawRows = utils.sheet_to_json<any[]>(ws, { header: 1 });
        if (!rawRows || rawRows.length < 2) return;

        // Header row analysis
        const headerRow = (rawRows[0] || []).map((h: any) => String(h || '').trim());
        const headerLower = headerRow.map((h: string) => h.toLowerCase());

        // Find SKU / Article Code column index
        let skuColIdx = headerLower.findIndex(h => h === 'sku' || h === 'barcode' || h === 'article' || h === 'code' || h === 'sku code' || h === 'article code');
        if (skuColIdx === -1) {
          if (headerLower.length > 1 && (headerLower[1].includes('sku') || headerLower[1].includes('code'))) {
            skuColIdx = 1;
          } else {
            skuColIdx = 1; // Default fallback to column B
          }
        }

        // Detect size columns (e.g. 35..45 or S..XXL)
        const sizeColMappings: { colIdx: number; sizeKey: string }[] = [];
        headerRow.forEach((colName: string, idx: number) => {
          if (idx === skuColIdx) return;
          const colClean = colName.toLowerCase().replace(/eu$/i, '').trim();
          if (/^\d+$/.test(colClean) || ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '3xl', '4xl', 'one size', 'onesize'].includes(colClean)) {
            sizeColMappings.push({ colIdx: idx, sizeKey: colClean.toUpperCase() });
          }
        });

        const catName = sheetName.trim() || 'General Inventory';

        // Parse data rows
        for (let r = 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          const rawSku = String(row[skuColIdx] || '').trim();
          if (!rawSku) continue;

          const skuLower = rawSku.toLowerCase();
          if (skuLower === 'sr.no' || skuLower === 'total' || skuLower === 'grand total' || skuLower === 'sku' || skuLower === 'totals') {
            continue;
          }

          const sizeStocks: Record<string, number> = {};
          let rowPairs = 0;

          sizeColMappings.forEach(mapping => {
            const qtyVal = Number(row[mapping.colIdx]) || 0;
            if (qtyVal !== 0) {
              sizeStocks[mapping.sizeKey] = qtyVal;
              rowPairs += qtyVal;
            }
          });

          if (sizeColMappings.length === 0) {
            const totalColIdx = headerLower.findIndex(h => h === 'total' || h === 'total stock' || h === 'quantity' || h === 'qty');
            if (totalColIdx !== -1) {
              rowPairs = Number(row[totalColIdx]) || 0;
              sizeStocks['One Size'] = rowPairs;
            }
          }

          allArticles.push({
            sku: rawSku,
            categoryName: catName,
            sizeStocks,
            totalPairs: rowPairs
          });

          if (!categoryMap[catName]) {
            categoryMap[catName] = { articleCount: 0, totalPairs: 0 };
          }
          categoryMap[catName].articleCount += 1;
          categoryMap[catName].totalPairs += rowPairs;
        }
      });

      if (allArticles.length === 0) {
        showToast('No valid article rows found in the selected Excel file.', 'warning');
        return;
      }

      const summaries = Object.keys(categoryMap).map(cName => ({
        categoryName: cName,
        articleCount: categoryMap[cName].articleCount,
        totalPairs: categoryMap[cName].totalPairs
      }));

      setImportParsedArticles(allArticles);
      setImportCategorySummaries(summaries);
      setIsImportConfirmModalOpen(true);
      showToast(`Parsed ${allArticles.length} articles across ${summaries.length} categories!`, 'success');

    } catch (err: any) {
      console.error('Import excel parse error:', err);
      showToast(err.message || 'Error reading Excel file', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Execute Database Import after User Confirmation
  const executeImportInventory = async () => {
    if (importParsedArticles.length === 0) return;

    try {
      setImportingState(true);
      showToast(`Importing ${importParsedArticles.length} articles to database...`, 'info');

      let updatedCount = 0;
      let createdCount = 0;

      for (const item of importParsedArticles) {
        const cleanSku = item.sku.trim().toUpperCase()
          .replace(/^(SG-)+/gi, 'SG-')
          .replace(/^(SA-)+/gi, 'SA-')
          .replace(/^(SGM-)+/gi, 'SGM-')
          .replace(/-([A-Z0-9]+)-\1$/gi, '-$1');

        const existing = products.find(p => {
          const pSkuClean = (p.sku || '').trim().toUpperCase().replace(/^(SG-)+/gi, 'SG-');
          const pBarcodeClean = (p.barcode || '').trim().toUpperCase().replace(/^(SG-)+/gi, 'SG-');
          return pSkuClean === cleanSku || pBarcodeClean === cleanSku;
        });

        let catId: string | null = null;
        const matchedCat = categories.find(c => c.name.toLowerCase().trim() === item.categoryName.toLowerCase().trim());
        if (matchedCat) {
          catId = matchedCat.id;
        } else {
          const lowerCat = item.categoryName.toLowerCase();
          const guessCat = categories.find(c => {
            const cLower = c.name.toLowerCase();
            if (lowerCat.includes('women') && cLower.includes('women')) return true;
            if (lowerCat.includes('boot') && cLower.includes('boot')) return true;
            if (lowerCat.includes('men') && cLower.includes('men')) return true;
            if (lowerCat.includes('jacket') && cLower.includes('jacket')) return true;
            if (lowerCat.includes('apparel') && cLower.includes('apparel')) return true;
            return false;
          });
          if (guessCat) catId = guessCat.id;
        }

        if (existing) {
          const mergedSizeStocks = { ...(existing.size_stocks || {}), ...item.sizeStocks };
          const totalStock = Object.values(mergedSizeStocks).reduce((sum, q) => sum + Number(q || 0), 0);

          const { error: updateErr } = await supabase
            .from('products')
            .update({
              size_stocks: mergedSizeStocks,
              current_stock: totalStock,
              sku: cleanSku
            })
            .eq('id', existing.id);

          if (updateErr) throw updateErr;
          updatedCount++;
        } else {
          const skuParts = cleanSku.split('-');
          const colorGuess = skuParts.length > 2 ? skuParts[skuParts.length - 1] : 'GEN';
          const totalStock = Object.values(item.sizeStocks).reduce((sum, q) => sum + Number(q || 0), 0);

          const { error: createErr } = await supabase
            .from('products')
            .insert({
              sku: cleanSku,
              name: `Article ${cleanSku}`,
              color: colorGuess.toUpperCase(),
              current_stock: totalStock,
              size_stocks: item.sizeStocks,
              barcode: `SG-${cleanSku.replace(/\s+/g, '-')}`,
              category_id: catId,
              selling_price: 3990,
              purchase_price: 1500,
              minimum_stock_alert: 5
            });

          if (createErr) throw createErr;
          createdCount++;
        }
      }

      showToast(`🎉 Inventory import successful! Updated: ${updatedCount}, Created: ${createdCount}`, 'success');
      setIsImportConfirmModalOpen(false);
      fetchData();

    } catch (err: any) {
      console.error('Import execution error:', err);
      showToast(err.message || 'Error updating database inventory', 'error');
    } finally {
      setImportingState(false);
    }
  };

  const handleAppsScriptUrlChange = (val: string) => {
    setAppsScriptUrl(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ky_apps_script_url', val);
    }
  };

  const handleSheetUrlChange = (val: string) => {
    setSheetUrl(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ky_sheet_url', val);
    }
  };

  const handlePushToGoogleSheet = async () => {
    if (!appsScriptUrl.trim()) {
      showToast('Please enter your Google Apps Script Web App URL', 'warning');
      return;
    }
    setPushingToSheet(true);
    try {
      // Fetch latest products from Supabase to ensure fresh data
      const { data: latestProducts, error } = await supabase
        .from('products')
        .select('*, categories(id, name)');
      
      if (error) {
        throw new Error(error.message);
      }

      if (!latestProducts || latestProducts.length === 0) {
        throw new Error('No products found in database to push.');
      }

      // Fetch past 15 days' sales and stock movements (fail-safe)
      let salesData: any[] = [];
      try {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        const localStart = new Date(fifteenDaysAgo.getFullYear(), fifteenDaysAgo.getMonth(), fifteenDaysAgo.getDate()).toISOString();
        
        const { data: recentSales } = await supabase
          .from('sale_items')
          .select(`
            product_id,
            size,
            quantity,
            selling_price,
            created_at,
            sales (
              id,
              sale_date
            ),
            products (
              sku,
              color
            )
          `)
          .gte('created_at', localStart);

        const { data: stockMovements } = await supabase
          .from('stock_movements')
          .select('product_id, reason, created_at')
          .eq('type', 'OUT')
          .gte('created_at', localStart);

        const filteredRecentSales = (recentSales || []).filter((item: any) => {
          const saleId = item.sales?.id || '';
          for (const sm of (stockMovements || [])) {
            if (sm.product_id === item.product_id && saleId && sm.reason && sm.reason.includes(saleId)) {
              if (sm.reason.toLowerCase().includes('sold from warehouse')) {
                return false; // Skip warehouse button sales!
              }
            }
          }
          return true;
        });

        salesData = filteredRecentSales.map((item: any) => {
          const saleId = item.sales?.id || '';
          let isWarehouse = false;
          
          for (const sm of (stockMovements || [])) {
            if (sm.product_id === item.product_id) {
              if (saleId && sm.reason && sm.reason.includes(saleId)) {
                if (sm.reason.toLowerCase().includes('warehouse') || sm.reason.toLowerCase().includes('dispatch')) {
                  isWarehouse = true;
                }
                break;
              } else if (sm.reason && sm.reason.toLowerCase().includes('warehouse dispatch sale')) {
                isWarehouse = true;
                break;
              }
            }
          }
          
          const saleDate = item.sales?.sale_date ? new Date(item.sales.sale_date) : new Date(item.created_at);
          const day = String(saleDate.getDate()).padStart(2, '0');
          const month = String(saleDate.getMonth() + 1).padStart(2, '0');
          const year = saleDate.getFullYear();
          const dateStr = `${day}-${month}-${year}`;

          return {
            date: dateStr,
            location: isWarehouse ? 'Warehouse' : 'Store',
            sku: item.products?.sku || 'N/A',
            color: item.products?.color || 'N/A',
            size: item.size || 'N/A'
          };
        });
      } catch (e) {
        console.error('Error fetching sales for sheet:', e);
      }

      await fetch(appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify({
          products: latestProducts,
          sales: salesData,
          spreadsheetUrl: sheetUrl
        })
      });
      // Google Apps Script usually takes 3-5 seconds to run.
      // We will wait 4 seconds to let the script finish processing.
      await new Promise(resolve => setTimeout(resolve, 4000));
      showToast('Google Sheet update triggered successfully!', 'success');
      setIsSyncModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Error updating Google Sheet', 'error');
    } finally {
      setPushingToSheet(false);
    }
  };

  const handleLoadPreview = async () => {
    if (!sheetUrl.trim()) {
      showToast('Please enter a Google Sheet URL', 'warning');
      return;
    }

    const csvUrl = getGoogleSheetCsvUrl(sheetUrl);
    if (!csvUrl) {
      showToast('Invalid Google Sheet URL format. Check the URL.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error("Could not load spreadsheet data. Make sure it is set to 'Anyone with the link can view'.");
      }
      const csvText = await response.text();
      const csvData = parseCSV(csvText);

      if (csvData.length < 2) {
        showToast('The Google Sheet seems empty or missing headers.', 'warning');
        setLoading(false);
        return;
      }

      // Determine if we have a two-row header
      let headers: string[] = [];
      let startRowIndex = 1;
      let headersOriginal: string[] = [];

      if (csvData.length >= 2) {
        const row0 = csvData[0].map(h => h.trim().toLowerCase());
        const row1 = csvData[1].map(h => h.trim().toLowerCase());
        
        const hasSkuInRow0 = row0.some(h => h === 'sku' || h === 'barcode' || h === 'article' || h === 'code');
        const hasSizesInRow1 = row1.some(h => /^\d+$/.test(h.replace(/eu$/i, '')) || ['xs', 's', 'm', 'l', 'xl', 'xxl'].includes(h));

        if (hasSkuInRow0 && hasSizesInRow1) {
          // Two-row header! Merge them
          headersOriginal = csvData[1];
          headers = row0.map((h0, idx) => {
            const h1 = row1[idx] || '';
            if (h1) return h1;
            return h0;
          });
          startRowIndex = 2;
        } else {
          headersOriginal = csvData[0];
          headers = row0;
          startRowIndex = 1;
        }
      } else {
        headersOriginal = csvData[0];
        headers = csvData[0].map(h => h.trim().toLowerCase());
        startRowIndex = 1;
      }
      
      // 1. Find SKU / Barcode column index
      let idColIndex = -1;
      const idSearchTerms = ['sku', 'barcode', 'article', 'code', 'article code', 'product code', 'id', 'item'];
      for (const term of idSearchTerms) {
        idColIndex = headers.findIndex(h => h === term);
        if (idColIndex !== -1) break;
      }
      
      if (idColIndex === -1) {
        idColIndex = 0; // Default to first column
      }

      // 2. Identify size columns
      const knownSizes = new Set([
        '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47',
        'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '3xl', '4xl', 'onesize', 'one size', 'free size'
      ]);

      const sizeMappings: { colIndex: number; sizeKey: string }[] = [];
      
      for (let i = 0; i < headers.length; i++) {
        if (i === idColIndex) continue;
        const rawH = headersOriginal[i]?.trim() || '';
        const cleanH = rawH.toLowerCase().replace(/eu$/i, '').trim();
        
        if (/^\d+$/.test(cleanH) || knownSizes.has(cleanH)) {
          sizeMappings.push({ colIndex: i, sizeKey: cleanH });
        }
      }

      // Check if we found a generic quantity column instead
      let qtyColIndex = -1;
      if (sizeMappings.length === 0) {
        const qtySearchTerms = ['quantity', 'qty', 'stock', 'current stock', 'total', 'total stock', 'pieces', 'pcs'];
        for (const term of qtySearchTerms) {
          qtyColIndex = headers.findIndex(h => h === term);
          if (qtyColIndex !== -1) break;
        }
      }

      if (sizeMappings.length === 0 && qtyColIndex === -1) {
        throw new Error("No size columns (e.g. '38', 'S') or quantity column (e.g. 'Quantity') found in your sheet.");
      }

      // Prepare preview items
      const items: typeof previewItems[] = [];
      
      for (let rowIndex = startRowIndex; rowIndex < csvData.length; rowIndex++) {
        const row = csvData[rowIndex];
        if (row.length === 0 || !row[idColIndex]) continue;

        const rawId = row[idColIndex].trim();
        
        // Skip summary rows
        const rawIdLower = rawId.toLowerCase();
        if (rawIdLower === 'total' || rawIdLower === 'grand total' || rawIdLower === 'sum' || rawIdLower === 'totals') {
          continue;
        }
        
        // Find matching product in database
        const matchedProd = findProductMatch(rawId, products);

        if (!matchedProd) {
          items.push({
            id: `row-${rowIndex}`,
            sku: rawId,
            name: 'Unknown Product',
            categoryName: 'N/A',
            oldStock: 0,
            newStock: 0,
            oldSizeStocks: {},
            newSizeStocks: {},
            status: 'not_found'
          } as any);
          continue;
        }

        const catName = matchedProd.categories?.name || 'Uncategorized';
        const allowedSizes = getCategorySizesByName(catName);

        let newSizeStocks: Record<string, number> = {};
        let newStock = 0;

        if (sizeMappings.length > 0) {
          // Initialize with all allowed sizes as 0
          allowedSizes.forEach(s => {
            newSizeStocks[s] = 0;
          });

          sizeMappings.forEach(mapping => {
            if (mapping.colIndex >= row.length) return;
            const rawVal = row[mapping.colIndex];
            const qty = parseInt(rawVal) || 0;
            
            // Match sheet sizeKey with allowed sizes
            const matchedSize = allowedSizes.find(s => s.toLowerCase().trim() === mapping.sizeKey.toLowerCase().trim());
            if (matchedSize) {
              newSizeStocks[matchedSize] = Math.max(0, qty);
            }
          });
          newStock = Object.values(newSizeStocks).reduce((sum, v) => sum + Number(v), 0);
        } else if (qtyColIndex !== -1) {
          if (qtyColIndex >= row.length) continue;
          const rawVal = row[qtyColIndex];
          newStock = Math.max(0, parseInt(rawVal) || 0);
          if (allowedSizes.includes('One Size')) {
            newSizeStocks = { 'One Size': newStock };
          } else {
            const oldSum = Object.values(matchedProd.size_stocks || {}).reduce((s, v) => s + Number(v), 0);
            if (oldSum > 0) {
              allowedSizes.forEach(s => {
                const oldVal = Number(matchedProd.size_stocks[s]) || 0;
                newSizeStocks[s] = Math.round((oldVal / oldSum) * newStock);
              });
              // Adjust roundoff error
              const newSum = Object.values(newSizeStocks).reduce((s, v) => s + Number(v), 0);
              const diff = newStock - newSum;
              if (diff !== 0 && allowedSizes.length > 0) {
                newSizeStocks[allowedSizes[0]] = Math.max(0, (newSizeStocks[allowedSizes[0]] || 0) + diff);
              }
            } else {
              allowedSizes.forEach(s => { newSizeStocks[s] = 0; });
              if (allowedSizes.length > 0) {
                newSizeStocks[allowedSizes[0]] = newStock;
              }
            }
          }
        }

        const isChanged = matchedProd.current_stock !== newStock || 
          JSON.stringify(matchedProd.size_stocks) !== JSON.stringify(newSizeStocks);

        items.push({
          id: matchedProd.id,
          sku: matchedProd.sku,
          name: matchedProd.name || 'Unnamed Product',
          categoryName: catName,
          oldStock: matchedProd.current_stock,
          newStock: newStock,
          oldSizeStocks: matchedProd.size_stocks || {},
          newSizeStocks: newSizeStocks,
          status: isChanged ? 'overwrite' : 'no_change'
        } as any);
      }

      setPreviewItems(items as any);
      setSyncStep('preview');
    } catch (err: any) {
      showToast(err.message || 'Error parsing Google Sheet data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSync = async () => {
    const toUpdate = previewItems.filter(item => item.status === 'overwrite');
    if (toUpdate.length === 0) {
      showToast('No product stock levels need updating.', 'info');
      setSyncStep('complete');
      return;
    }

    setSyncStep('syncing');
    setSyncProgress({
      total: toUpdate.length,
      current: 0,
      success: 0,
      error: 0,
      log: ['Starting database updates...']
    });

    const batchSize = 5;
    let successCount = 0;
    let errorCount = 0;
    const logs: string[] = ['Starting database updates...'];

    const updateLog = (newLog: string) => {
      logs.push(newLog);
      setSyncProgress(prev => ({
        ...prev,
        log: [...logs]
      }));
    };

    for (let i = 0; i < toUpdate.length; i += batchSize) {
      const batch = toUpdate.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (item) => {
        try {
          const qtyDiff = item.newStock - item.oldStock;

          // 1. Update product stocks (both total and size-wise jsonb)
          const { error: prodErr } = await supabase
            .from('products')
            .update({
              current_stock: item.newStock,
              size_stocks: item.newSizeStocks,
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

          if (prodErr) throw prodErr;

          // 2. Insert stock movement log
          const { error: moveErr } = await supabase
            .from('stock_movements')
            .insert({
              product_id: item.id,
              type: 'ADJUSTMENT',
              quantity: qtyDiff,
              reason: `Google Sheet Sync | Previous: ${item.oldStock} -> New: ${item.newStock}`
            });

          if (moveErr) throw moveErr;

          successCount++;
          updateLog(`✓ Successfully updated ${item.sku}: ${item.oldStock} → ${item.newStock}`);
        } catch (err: any) {
          errorCount++;
          updateLog(`✗ Error updating ${item.sku}: ${err.message || 'Unknown error'}`);
        } finally {
          setSyncProgress(prev => ({
            ...prev,
            current: prev.current + 1,
            success: successCount,
            error: errorCount
          }));
        }
      }));
    }

    // Insert sync activity log
    try {
      await supabase.from('activity_logs').insert({
        action: 'STOCK_EDITED',
        details: `Synced stock levels for ${successCount} products from Google Sheet (${errorCount} errors).`
      });
    } catch (e) {
      console.error('Error logging activity log:', e);
    }

    updateLog(`Sync complete! ${successCount} updated successfully, ${errorCount} errors.`);
    setSyncStep('complete');
    fetchData(); // Reload page tables
  };

  useEffect(() => {
    fetchData();

    // Enable realtime syncing
    const channel = supabase
      .channel('inventory-realtime-chan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        silentReload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const silentReload = async () => {
    const { data: prodData } = await supabase.from('products').select('*, categories(id, name)').order('created_at', { ascending: false });
    if (prodData) setProducts(prodData);
  };

  // Preset Sizes builder based on selected Category
  const getCategorySizes = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return ['One Size'];
    
    if (SIZE_PRESETS[cat.name]) {
      return SIZE_PRESETS[cat.name];
    }
    
    const name = cat.name.toLowerCase().trim();
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

  useEffect(() => {
    // Reset sizes object when category changes in add mode
    if (formMode === 'add') {
      const sizes = getCategorySizes(categoryId);
      const initialStocks: Record<string, number> = {};
      sizes.forEach(sz => {
        initialStocks[sz] = 0;
      });
      setSizeStocks(initialStocks);
      setDisplaySize('');
    }
  }, [categoryId]);

  const handleSizeStockChange = (sizeName: string, val: number) => {
    setSizeStocks(prev => ({
      ...prev,
      [sizeName]: Math.max(0, val)
    }));
  };

  const openAddForm = () => {
    setFormMode('add');
    setActiveProductId('');
    setSku('');
    setName('');
    const defaultCatId = categories[0]?.id || '';
    setCategoryId(defaultCatId);
    setBrand('KY');
    setColor('');
    setRackLocation('');
    setPurchasePrice(0);
    setSellingPrice(0);
    setNotes('');
    setDisplaySize('');

    // Pre-build sizes
    const sizes = getCategorySizes(defaultCatId);
    const initialStocks: Record<string, number> = {};
    sizes.forEach(sz => {
      initialStocks[sz] = 0;
    });
    setSizeStocks(initialStocks);

    setIsFormOpen(true);
  };

  const openEditForm = (p: Product) => {
    setFormMode('edit');
    setActiveProductId(p.id);
    setSku(p.sku);
    setName(p.name);
    setCategoryId(p.category_id || '');
    setBrand(p.brand || 'KY');
    setColor(p.color || '');
    setRackLocation(p.rack_location || '');
    setPurchasePrice(p.purchase_price);
    setSellingPrice(p.selling_price);
    setNotes(p.notes || '');
    setDisplaySize(p.size || '');

    // Setup size stocks
    const catSizes = getCategorySizes(p.category_id);
    const currentStocks: Record<string, number> = {};
    catSizes.forEach(sz => {
      currentStocks[sz] = Number(p.size_stocks?.[sz]) || 0;
    });
    setSizeStocks(currentStocks);

    setIsFormOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete article "${name}"?`)) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      showToast('Article deleted successfully', 'success');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Error deleting article', 'error');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku) {
      showToast('SKU Code is required', 'warning');
      return;
    }

    // Auto calculate total stock from size stocks
    const totalStock = Object.values(sizeStocks).reduce((sum, qty) => sum + Number(qty), 0);
    
    // Auto generate barcode if not present
    const barcodeVal = `SG-${sku.replace(/\s+/g, '-')}-${color.replace(/\s+/g, '-') || 'GEN'}`;

    const payload = {
      sku,
      name,
      category_id: categoryId || null,
      brand,
      color,
      rack_location: rackLocation || null,
      size_stocks: sizeStocks,
      current_stock: totalStock,
      purchase_price: Number(purchasePrice),
      selling_price: Number(sellingPrice),
      barcode: barcodeVal,
      notes,
      size: displaySize || null
    };

    try {
      if (formMode === 'add') {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
        showToast('Article added successfully', 'success');
      } else {
        // Edit mode manual adjustment logging checks
        const existing = products.find(p => p.id === activeProductId);
        if (existing && existing.current_stock !== totalStock) {
          const diff = totalStock - existing.current_stock;
          await supabase.from('stock_movements').insert({
            product_id: activeProductId,
            type: diff > 0 ? 'IN' : 'OUT',
            quantity: Math.abs(diff),
            reason: `Size stock edit adjustment (Stock level updated from ${existing.current_stock} to ${totalStock})`
          });
        }

        const { error } = await supabase.from('products').update(payload).eq('id', activeProductId);
        if (error) throw error;
        showToast('Article updated successfully', 'success');
      }
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Error saving article. SKU code must be unique.', 'error');
    }
  };

  // Sold From Warehouse submit handler
  const handleWarehouseSoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseSku.trim()) {
      showToast('Please enter a SKU Code', 'warning');
      return;
    }
    
    if (!warehouseSize) {
      showToast('Please select a size', 'warning');
      return;
    }

    const price = parseFloat(warehousePrice);
    if (isNaN(price) || price < 0) {
      showToast('Please enter a valid price', 'warning');
      return;
    }

    // Find matching product in database or auto-create with 0 stock
    let matched = products.find(p => p.sku.toLowerCase().trim() === warehouseSku.toLowerCase().trim());
    let isAutoCreated = false;
    
    if (!matched) {
      const skuVal = warehouseSku.trim();
      const skuParts = skuVal.split('-');
      const colorGuess = skuParts.length > 2 ? skuParts[skuParts.length - 1] : 'GEN';
      const colorVal = colorGuess.toUpperCase();
      const nameVal = `Warehouse ${skuVal}`;
      const barcodeVal = `SG-${skuVal.replace(/\s+/g, '-')}-${colorVal.replace(/\s+/g, '-')}`;
      
      const defaultCategory = categories.find(c => c.name.toLowerCase().includes('women footwear')) || categories[0] || null;
      
      try {
        const { data: newProd, error: createErr } = await supabase
          .from('products')
          .insert({
            sku: skuVal,
            name: nameVal,
            color: colorVal,
            selling_price: price,
            current_stock: 0,
            size_stocks: {},
            barcode: barcodeVal,
            category_id: defaultCategory?.id || null
          })
          .select()
          .single();
        
        if (createErr) throw createErr;
        
        matched = {
          id: newProd.id,
          sku: newProd.sku,
          name: newProd.name,
          color: newProd.color || colorVal,
          selling_price: newProd.selling_price,
          current_stock: 0,
          size_stocks: {},
          barcode: newProd.barcode,
          category_id: newProd.category_id,
          brand: newProd.brand || '',
          size: newProd.size || '',
          rack_location: newProd.rack_location || '',
          purchase_price: newProd.purchase_price || 0,
          minimum_stock_alert: newProd.minimum_stock_alert || 5,
          image_url: newProd.image_url || '',
          notes: newProd.notes || '',
          created_at: newProd.created_at
        };
        isAutoCreated = true;
      } catch (err: any) {
        showToast(`Failed to auto-create missing SKU: ${err.message}`, 'error');
        return;
      }
    }

    setWarehouseSubmitting(true);
    try {
      // 1. Insert Sales Invoice entry
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({ total_amount: price })
        .select()
        .single();
      if (saleErr) throw saleErr;

      // 2. Insert Sale Item (this deducts stock automatically in the trigger)
      const { error: itemErr } = await supabase
        .from('sale_items')
        .insert({
          sale_id: saleData.id,
          product_id: matched.id,
          size: warehouseSize,
          quantity: 1,
          selling_price: price
        });
      if (itemErr) throw itemErr;

      // Find the stock movement created by the trigger and rename its reason to reflect Warehouse Sale
      const { data: movementData } = await supabase
        .from('stock_movements')
        .select('id')
        .eq('product_id', matched.id)
        .eq('type', 'OUT')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (movementData && movementData.length > 0) {
        await supabase
          .from('stock_movements')
          .update({ reason: `Sold from Warehouse (Size ${warehouseSize}) (Sale ID: ${saleData.id})` })
          .eq('id', movementData[0].id);
      }

      // 3. Immediately update the product stock back to original pre-sale levels
      // (This reverts the trigger's automatic decrement)
      const { error: restoreErr } = await supabase
        .from('products')
        .update({
          current_stock: matched.current_stock,
          size_stocks: matched.size_stocks
        })
        .eq('id', matched.id);
      if (restoreErr) throw restoreErr;

      // 4. Log warehouse sale in activity log
      await supabase.from('activity_logs').insert({
        action: 'SALE_CREATED',
        details: `Sold 1 unit of size ${warehouseSize} from Warehouse for SKU ${matched.sku} (Price: ₹${price}). Inventory stock level was not changed.`
      });

      showToast(`Sold 1 unit of Size ${warehouseSize} from Warehouse successfully!`, 'success');
      setIsWarehouseSoldOpen(false);
      fetchData(); // Reload inventory
    } catch (err: any) {
      showToast(err.message || 'Error recording warehouse sale', 'error');
    } finally {
      setWarehouseSubmitting(false);
    }
  };

  // Open Sell Modal
  const openSellModal = (p: Product) => {
    setSellProduct(p);
    setSellPrice(p.selling_price);
    
    // Find first size that has stock > 0
    const catSizes = getCategorySizes(p.category_id);
    const availableSize = catSizes.find(sz => (p.size_stocks?.[sz] || 0) > 0) || catSizes[0] || '';
    setSellSize(availableSize);
    
    setIsSellOpen(true);
  };

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellProduct || !sellSize) return;

    const currentSizeStock = sellProduct.size_stocks?.[sellSize] || 0;
    if (currentSizeStock <= 0) {
      showToast(`Warning: Size ${sellSize} is out of stock.`, 'warning');
      return;
    }

    setSellingSubmitting(true);
    try {
      // 1. Insert Sales Invoice entry
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({ total_amount: sellPrice })
        .select()
        .single();
      if (saleErr) throw saleErr;

      // 2. Insert Sale Item (This triggers the database code to deduct size stock, current stock, log movement, log activity!)
      const { error: itemErr } = await supabase
        .from('sale_items')
        .insert({
          sale_id: saleData.id,
          product_id: sellProduct.id,
          size: sellSize,
          quantity: 1,
          selling_price: sellPrice
        });
      if (itemErr) throw itemErr;

      showToast(`Sold 1 unit of Size ${sellSize} successfully!`, 'success');
      setIsSellOpen(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Error recording sale', 'error');
    } finally {
      setSellingSubmitting(false);
    }
  };

  // Extract unique colors and sizes for dropdown lists
  const availableColors = Array.from(new Set(products.map(p => p.color?.trim()).filter(Boolean))).sort();
  const availableSizes = Array.from(new Set(products.flatMap(p => Object.keys(p.size_stocks || {}).filter(Boolean)))).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  // Filter products by search query, stock criteria, color, and size
  const filteredProducts = products.filter((p) => {
    // 1. Stock Filter
    if (stockFilter === 'low') {
      const catName = p.categories?.name || '';
      const nameClean = (catName || '').toLowerCase().trim();
      const isFootwear = nameClean === 'mens footwear' || nameClean === 'women footwear' || nameClean === 'winter boot' || nameClean === 'winter boots';
      if (!(isFootwear && p.current_stock < 7)) {
        return false;
      }
    }

    // 2. Category Filter
    if (selectedCategoryFilter !== 'all') {
      if (p.category_id !== selectedCategoryFilter) {
        return false;
      }
    }

    // 3. Color Filter
    if (selectedColorFilter !== 'all') {
      if ((p.color || '').trim().toLowerCase() !== selectedColorFilter.toLowerCase()) {
        return false;
      }
    }

    // 4. Size Filter
    if (selectedSizeFilter !== 'all') {
      const qty = Number(p.size_stocks?.[selectedSizeFilter]) || 0;
      if (qty <= 0) {
        return false;
      }
    }

    // 5. Search Query Filter
    const query = searchQuery.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(query)) ||
      p.sku.toLowerCase().includes(query) ||
      p.color.toLowerCase().includes(query) ||
      (p.rack_location && p.rack_location.toLowerCase().includes(query))
    );
  });

  // Group products by category
  const getGroupedProducts = () => {
    const groups: Record<string, Product[]> = {};
    categories.forEach(c => {
      groups[c.name] = [];
    });
    
    filteredProducts.forEach(p => {
      const catName = p.categories?.name || 'Uncategorized';
      if (!groups[catName]) {
        groups[catName] = [];
      }
      groups[catName].push(p);
    });

    return groups;
  };

  const grouped = getGroupedProducts();

  return (
    <div className="flex flex-col gap-6 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-855 dark:text-white">Inventory Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Audit article codes, manage size-wise stocks, and record daily checkouts.</p>
        </div>
        <div className="flex items-center gap-3 self-stretch md:self-auto flex-wrap">
          <button
            onClick={() => {
              setWarehouseSku('');
              setWarehouseSize('');
              setWarehousePrice('');
              setIsWarehouseSoldOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-550 active:scale-[0.98] text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all justify-center cursor-pointer font-sans"
          >
            <ShoppingBag className="w-4.5 h-4.5" />
            Sold From Warehouse
          </button>
          <button
            onClick={handleExportInventory}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all justify-center cursor-pointer"
          >
            <Download className="w-4.5 h-4.5" />
            Export Inventory
          </button>
          <button
            onClick={() => {
              const fileInput = document.getElementById('excel-inventory-file-input');
              if (fileInput) fileInput.click();
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-[0.98] text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all justify-center cursor-pointer font-sans"
          >
            <Upload className="w-4.5 h-4.5" />
            Import Inventory
          </button>
          <input
            id="excel-inventory-file-input"
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={handleExcelInventoryFileSelect}
          />
          <button
            onClick={() => {
              setSheetUrl('');
              setSyncStep('input');
              setIsSyncModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-555 active:scale-[0.98] text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all justify-center cursor-pointer"
          >
            <FileSpreadsheet className="w-4.5 h-4.5" />
            Sync Google Sheet
          </button>
          <button
            onClick={openAddForm}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98] text-white font-bold text-xs tracking-wider uppercase shadow-md transition-all justify-center"
          >
            <Plus className="w-4.5 h-4.5" />
            Add Article
          </button>
        </div>
      </div>

      {/* Search Bar and Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search className="w-4.5 h-4.5" />
          </span>
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-405"
            placeholder="Search SKU, color, name, rack..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Category Filter Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Color Filter Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedColorFilter}
            onChange={(e) => setSelectedColorFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer text-slate-700 dark:text-slate-200 capitalize"
          >
            <option value="all">All Colors</option>
            {availableColors.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>

        {/* Size Filter Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedSizeFilter}
            onChange={(e) => setSelectedSizeFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Sizes</option>
            {availableSizes.map((sz) => (
              <option key={sz} value={sz}>Size {sz}</option>
            ))}
          </select>
        </div>

        {/* Stock Filter Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as 'all' | 'low')}
            className="px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Articles</option>
            <option value="low">Low Stock (Footwear &lt; 7)</option>
          </select>

          {(stockFilter === 'low' || selectedColorFilter !== 'all' || selectedSizeFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setStockFilter('all');
                setSelectedColorFilter('all');
                setSelectedSizeFilter('all');
              }}
              className="px-3 py-2.5 text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 rounded-xl transition-all cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="py-20 text-center flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-550" />
          <span className="text-sm text-slate-500 font-semibold animate-pulse">Synchronizing inventory cache...</span>
        </div>
      ) : (
        /* Categorized Lists */
        <div className="space-y-10">
          {categories.map((cat) => {
            // If filtering by a specific category, hide all other categories
            if (selectedCategoryFilter !== 'all' && cat.id !== selectedCategoryFilter) return null;

            const catProds = grouped[cat.name] || [];
            // Hide empty categories in search or when filtering by low stock
            if (catProds.length === 0 && (searchQuery || stockFilter === 'low')) return null;
            
            const sizes = getCategorySizes(cat.id);

            return (
              <div key={cat.id} className="space-y-4">
                {/* Category Header */}
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="w-2.5 h-4.5 rounded-md bg-gradient-to-b from-indigo-500 to-emerald-500" />
                  <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">{cat.name}</h2>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {catProds.length} Articles
                  </span>
                </div>

                {catProds.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-400">
                    No articles registered in this category. Click "Add Article" to get started.
                  </div>
                ) : (
                  /* Custom Category Table (Desktop view) and 3D Cards (Mobile view) */
                  <div className="space-y-4">
                    {/* Desktop View */}
                    <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950/40 text-[9px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-100 dark:border-slate-850">
                              <th className="px-1.5 py-2.5 w-10 text-center">Sr No</th>
                              <th className="px-1.5 py-2.5 w-24">SKU Code</th>
                              <th className="px-1.5 py-2.5 w-36">Article Name</th>
                              <th className="px-1.5 py-2.5 w-24">Color Name</th>
                              <th className="px-1.5 py-2.5 text-center w-20">Rack</th>
                              {/* Dynamic Size Column Headers */}
                              {sizes.map((sz) => (
                                <th key={sz} className="px-1 py-2.5 text-center w-12">Sz {sz}</th>
                              ))}
                              {/* Display Piece Column Header */}
                              <th className="px-1 py-2.5 text-center w-14 font-extrabold text-amber-600 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-500/10 border-l border-r border-amber-500/10">Display</th>
                              {/* Total Column Header */}
                              <th className="px-1 py-2.5 text-center w-14 font-extrabold text-indigo-500 bg-indigo-500/5">Total</th>
                              <th className="px-1.5 py-2.5 text-right w-28">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                            {catProds.map((p, index) => (
                              <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors">
                                <td className="px-1.5 py-2 text-center font-bold text-slate-400">{index + 1}</td>
                                <td className="px-1.5 py-2 font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[96px]">{p.sku}</td>
                                <td className="px-1.5 py-2 font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[144px]" title={p.name || ''}>
                                  {p.name || <span className="text-slate-400 italic">Unnamed</span>}
                                </td>
                                <td className="px-1.5 py-2 font-medium text-slate-650 dark:text-slate-400 truncate max-w-[96px]">
                                  <div className="flex items-center gap-1.5">
                                    {p.color ? (
                                      <span
                                        className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-700 flex-shrink-0"
                                        style={{ background: getColorCssValue(p.color) }}
                                        title={p.color}
                                      />
                                    ) : (
                                      <span className="w-2.5 h-2.5 rounded-full border border-dashed border-slate-300 dark:border-slate-700 flex-shrink-0" />
                                    )}
                                    <span className="capitalize truncate">{p.color || 'N/A'}</span>
                                  </div>
                                </td>
                                <td className="px-1.5 py-2 text-center">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    p.rack_location ? 'bg-indigo-50 dark:bg-slate-850 text-indigo-400 border border-indigo-500/10' : 'text-slate-400 font-medium'
                                  }`}>
                                    {p.rack_location || '-'}
                                  </span>
                                </td>
                                {/* Dynamic Size Cells */}
                                {sizes.map((sz) => {
                                  const qty = p.size_stocks?.[sz] || 0;
                                  const is37 = sz === '37' || sz === '37eu' || sz === '37EU';
                                  const isYellow = is37 ? qty >= 3 : qty >= 2;
                                  return (
                                    <td key={sz} className="px-1 py-2 text-center">
                                      <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                        qty <= 0 
                                          ? 'text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30' 
                                          : isYellow
                                            ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/10'
                                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10'
                                      }`}>
                                        {qty}
                                      </span>
                                    </td>
                                  );
                                })}
                                {/* Display Piece Column Cell */}
                                <td className="px-1 py-2 text-center bg-amber-500/5 dark:bg-amber-500/10 border-l border-r border-amber-500/10">
                                  <span className="font-bold text-[10px] text-amber-700 dark:text-amber-400 uppercase">
                                    {p.size || '-'}
                                  </span>
                                </td>
                                {/* Total Column Cell */}
                                <td className="px-1 py-2 text-center bg-indigo-500/5">
                                  <span className="font-extrabold text-[11px] text-indigo-600 dark:text-indigo-400">
                                    {p.current_stock}
                                  </span>
                                </td>
                                {/* Actions buttons */}
                                <td className="px-1.5 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {/* Sell Button */}
                                    <button
                                      onClick={() => openSellModal(p)}
                                      className="px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 rounded-lg transition-all active:scale-95 flex items-center gap-1"
                                      title="Sell 1 Unit"
                                    >
                                      <ShoppingBag className="w-3 h-3" />
                                      <span>Sell</span>
                                    </button>

                                    {/* Edit Button */}
                                    <button
                                      onClick={() => openEditForm(p)}
                                      className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-all active:scale-95"
                                      title="Edit Article"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Delete Button */}
                                    <button
                                      onClick={() => handleDelete(p.id, p.name)}
                                      className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 transition-all active:scale-95"
                                      title="Delete Article"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/25">
                              <td colSpan={5} className="px-3 py-3 text-right font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</td>
                              {/* Dynamic Size Totals */}
                              {sizes.map((sz) => {
                                const sizeSum = catProds.reduce((sum, p) => sum + (Number(p.size_stocks?.[sz]) || 0), 0);
                                return (
                                  <td key={sz} className="px-1 py-3 text-center font-extrabold text-slate-700 dark:text-slate-300">
                                    {sizeSum}
                                  </td>
                                );
                              })}
                              {/* Display Column Footer Cell */}
                              <td className="px-1 py-3 text-center bg-amber-500/5 dark:bg-amber-500/10 border-l border-r border-amber-500/10 font-bold text-slate-400 dark:text-slate-550">-</td>
                              {/* Grand Total Column Cell */}
                              <td className="px-1 py-3 text-center bg-indigo-500/10 border-l border-r border-indigo-500/20 font-bold">
                                <span className="font-black text-[12px] text-indigo-600 dark:text-indigo-400">
                                  {catProds.reduce((sum, p) => sum + (Number(p.current_stock) || 0), 0)}
                                </span>
                              </td>
                              {/* Empty Actions cell */}
                              <td className="px-1.5 py-3"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* Mobile View (3D Card Layout) */}
                    <div className="block md:hidden space-y-4">
                      {catProds.map((p, index) => (
                        <div 
                          key={p.id} 
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-[0_8px_0_#cbd5e1] dark:shadow-[0_8px_0_#020617] hover:translate-y-[-1px] hover:shadow-[0_9px_0_#cbd5e1] dark:hover:shadow-[0_9px_0_#020617] active:translate-y-[2px] active:shadow-[0_4px_0_#cbd5e1] dark:active:shadow-[0_4px_0_#020617] transition-all transform relative overflow-hidden"
                        >
                          {/* Card Header (Tope) */}
                          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_2px_0_#cbd5e1] dark:shadow-[0_2px_0_#020617] gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-indigo-650 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/40 px-2 py-0.5 rounded-lg shadow-sm">
                                #{index + 1}
                              </span>
                              <span className="font-mono font-black text-xs text-slate-800 dark:text-slate-100 tracking-wide uppercase select-all">
                                {p.sku}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-[0_2px_0_#cbd5e1] dark:shadow-[0_2px_0_#020617] text-[10px] font-bold text-slate-700 dark:text-slate-305">
                              {p.color ? (
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-700 flex-shrink-0 shadow-inner"
                                  style={{ background: getColorCssValue(p.color) }}
                                  title={p.color}
                                />
                              ) : (
                                <span className="w-2.5 h-2.5 rounded-full border border-dashed border-slate-300 dark:border-slate-700 flex-shrink-0" />
                              )}
                              <span className="capitalize text-slate-700 dark:text-slate-300">{p.color || 'N/A'}</span>
                            </div>
                          </div>

                          {/* Card Body */}
                          <div className="space-y-4">
                            {/* Product Name & Category Info */}
                            <div className="px-1">
                              <h4 className="text-xs font-black text-slate-850 dark:text-slate-150 leading-tight">{p.name || 'Unnamed Article'}</h4>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">Category: {cat.name}</p>
                            </div>

                            {/* Sizes Section */}
                            <div className="bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_3px_0_#cbd5e1] dark:shadow-[0_3px_0_#020617]">
                              <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2 px-0.5">Size Stocks</span>
                              <div className="grid grid-cols-4 gap-2">
                                {sizes.map((sz) => {
                                  const qty = p.size_stocks?.[sz] || 0;
                                  const is37 = sz === '37' || sz === '37eu' || sz === '37EU';
                                  const isYellow = is37 ? qty >= 3 : qty >= 2;
                                  return (
                                    <div 
                                      key={sz} 
                                      className={`flex flex-col items-center justify-center py-2 rounded-xl border text-center transition-all ${
                                        qty <= 0
                                          ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/30 shadow-[0_2px_0_#fee2e2] dark:shadow-[0_2px_0_#450a0a]'
                                          : isYellow
                                            ? 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900/30 shadow-[0_2px_0_#fef08a] dark:shadow-[0_2px_0_#713f12]'
                                            : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30 shadow-[0_2px_0_#a7f3d0] dark:shadow-[0_2px_0_#064e3b]'
                                      }`}
                                    >
                                      <span className="text-[8px] font-extrabold uppercase text-slate-400 dark:text-slate-500">Sz {sz}</span>
                                      <span className="text-xs font-black mt-0.5">{qty}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Details Row */}
                            <div className="grid grid-cols-3 gap-2 px-0.5">
                              <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/35 shadow-[0_2px_0_#cbd5e1] dark:shadow-[0_2px_0_#020617] text-center">
                                <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Rack</span>
                                <span className="font-extrabold text-[11px] text-slate-700 dark:text-slate-300 truncate w-full px-0.5">
                                  {p.rack_location || '-'}
                                </span>
                              </div>
                              <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/35 shadow-[0_2px_0_#cbd5e1] dark:shadow-[0_2px_0_#020617] text-center">
                                <span className="text-amber-600 dark:text-amber-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Display</span>
                                <span className="font-black text-[11px] text-amber-700 dark:text-amber-400 uppercase truncate w-full px-0.5">
                                  {p.size || '-'}
                                </span>
                              </div>
                              <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 shadow-[0_2px_0_#cbd5e1] dark:shadow-[0_2px_0_#020617] text-center">
                                <span className="text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider text-[8px] block mb-1">Total</span>
                                <span className="font-black text-xs text-indigo-650 dark:text-indigo-400 truncate w-full px-0.5">
                                  {p.current_stock}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Card Actions Footer */}
                          <div className="pt-3.5 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-between items-center gap-2">
                            <button
                              onClick={() => openSellModal(p)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] uppercase tracking-wider shadow-[0_3px_0_#047857] hover:shadow-[0_4px_0_#047857] active:translate-y-[1px] active:shadow-[0_2px_0_#047857] transition-all cursor-pointer"
                            >
                              <ShoppingBag className="w-4 h-4" />
                              <span>Sell Unit</span>
                            </button>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEditForm(p)}
                                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-[0_3px_0_#e2e8f0] dark:shadow-[0_3px_0_#020617] active:translate-y-[1px] active:shadow-[0_2px_0_#e2e8f0] dark:active:shadow-[0_2px_0_#020617] transition-all text-slate-500 dark:text-slate-400 hover:text-indigo-550 cursor-pointer"
                                title="Edit Article"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(p.id, p.name)}
                                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-[0_3px_0_#e2e8f0] dark:shadow-[0_3px_0_#020617] active:translate-y-[1px] active:shadow-[0_2px_0_#e2e8f0] dark:active:shadow-[0_2px_0_#020617] transition-all text-slate-500 dark:text-slate-400 hover:text-rose-500 cursor-pointer"
                                title="Delete Article"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 1. Add / Edit Article Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={formMode === 'add' ? 'Add New Article' : 'Edit Article Details'}
      >
        <form onSubmit={handleFormSubmit} className="space-y-4 font-sans select-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Category Select */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Category *</label>
              <select
                required
                disabled={formMode === 'edit'}
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id} className="dark:bg-slate-900">{c.name}</option>
                ))}
              </select>
            </div>

            {/* SKU Code */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">SKU / Article Code *</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. M-101"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </div>

            {/* Article Name */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-bold text-slate-500 block">Article Name (Optional)</label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Leather Loafers"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Color Name */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Color Name</label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Black / Tan"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>

            {/* Rack Location */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Rack Location (Optional)</label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Rack A-3"
                value={rackLocation}
                onChange={(e) => setRackLocation(e.target.value)}
              />
            </div>

            {/* Pricing Structures (required to keep operations reporting valid!) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Estimated Unit Cost Price (₹)</label>
              <input
                type="number"
                step="0.01"
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0.00"
                value={purchasePrice || ''}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Estimated Unit Selling Price (₹)</label>
              <input
                type="number"
                step="0.01"
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0.00"
                value={sellingPrice || ''}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
              />
            </div>

            {/* Display Piece Selector */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Display Piece Size (Optional)</label>
              <select
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-250"
                value={displaySize}
                onChange={(e) => setDisplaySize(e.target.value)}
              >
                <option value="" className="dark:bg-slate-900">None</option>
                {getCategorySizes(categoryId).map((sz) => (
                  <option key={sz} value={sz} className="dark:bg-slate-900">
                    Size {sz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sizes Stock Quantities Grid Input */}
          <div className="space-y-2.5 pt-3.5 border-t border-slate-100 dark:border-slate-800">
            <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider block">Size Stock Quantities</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {getCategorySizes(categoryId).map((sz) => (
                <div key={sz} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-center space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 block">Size {sz}</span>
                  <input
                    type="number"
                    min="0"
                    className="w-full text-center bg-transparent border-none p-0 focus:ring-0 font-extrabold text-sm text-indigo-550 dark:text-indigo-400"
                    value={sizeStocks[sz] ?? 0}
                    onChange={(e) => handleSizeStockChange(sz, parseInt(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1 pt-2">
            <label className="text-xs font-bold text-slate-500 block">Description Notes</label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Leather specifications, batch labels..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95"
            >
              Save Article
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Sell Article Confirmation Modal */}
      <Modal
        isOpen={isSellOpen}
        onClose={() => setIsSellOpen(false)}
        title={`Daily Sale Check: ${sellProduct?.name || sellProduct?.sku}`}
      >
        <form onSubmit={handleSellSubmit} className="space-y-4 font-sans select-none">
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-850 text-xs font-semibold text-slate-500">
            <span>SKU: <strong className="text-slate-800 dark:text-slate-200 font-mono">{sellProduct?.sku}</strong></span>
            <span>Color: <strong className="text-slate-800 dark:text-slate-200">{sellProduct?.color || 'N/A'}</strong></span>
            <span>Rack: <strong className="text-slate-800 dark:text-slate-200">{sellProduct?.rack_location || '-'}</strong></span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Select Size to Sell */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Choose Size to Sell *</label>
              <select
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-bold"
                value={sellSize}
                onChange={(e) => setSellSize(e.target.value)}
              >
                {sellProduct && getCategorySizes(sellProduct.category_id).map((sz) => {
                  const qty = sellProduct.size_stocks?.[sz] || 0;
                  return (
                    <option key={sz} value={sz} disabled={qty <= 0} className="dark:bg-slate-900">
                      Size {sz} (Available: {qty})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Selling price */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 block">Daily Sale Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                placeholder="0.00"
                value={sellPrice || ''}
                onChange={(e) => setSellPrice(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsSellOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sellingSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 min-w-[100px] flex justify-center"
            >
              {sellingSubmitting ? 'Processing...' : 'Complete Sell'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Google Sheet Sync Dialog */}
      <Modal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        title="Sync Stock with Google Sheet"
      >
        <div className="space-y-4 font-sans text-xs">
          {/* Tab Switcher */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 mb-2">
            <button
              type="button"
              onClick={() => setSyncOption('pull')}
              className={`flex-1 pb-2.5 text-center font-bold border-b-2 text-xs transition-all cursor-pointer ${
                syncOption === 'pull' 
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              Pull from Sheet (Import)
            </button>
            <button
              type="button"
              onClick={() => setSyncOption('push')}
              className={`flex-1 pb-2.5 text-center font-bold border-b-2 text-xs transition-all cursor-pointer ${
                syncOption === 'push' 
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              Push to Sheet (One-Click Update)
            </button>
          </div>

          {syncOption === 'pull' && (
            <div className="space-y-4">
              {/* Progress / Step Indicators */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                {['1. Sheet Link', '2. Preview Changes', '3. Syncing Data', '4. Complete'].map((label, idx) => {
                  const steps: typeof syncStep[] = ['input', 'preview', 'syncing', 'complete'];
                  const currentStepIdx = steps.indexOf(syncStep);
                  const isActive = idx === currentStepIdx;
                  const isPast = idx < currentStepIdx;
                  
                  return (
                    <div key={label} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center border font-bold text-[9px] ${
                        isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' :
                        isPast ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                        'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className={isActive ? 'text-indigo-600 dark:text-indigo-400' : isPast ? 'text-emerald-500' : 'text-slate-400'}>
                        {label.split('. ')[1]}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* STEP 1: Link input */}
              {syncStep === 'input' && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-955/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs text-slate-500 leading-relaxed space-y-2">
                    <p className="font-bold text-slate-700 dark:text-slate-300">How to sync:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Ensure your Google Sheet is shared so that <strong>"Anyone with the link can view"</strong> (restricted sheets cannot be synced).</li>
                      <li>The sheet should contain columns for <strong>SKU</strong> (or barcode/article code) and size-specific columns (like <strong>35, 36, 37, 38...</strong> or <strong>XS, S, M, L...</strong>) containing stock quantities.</li>
                      <li>Paste the full URL from the browser bar below.</li>
                    </ol>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block">Google Sheet URL</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                      placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
                      value={sheetUrl}
                      onChange={(e) => handleSheetUrlChange(e.target.value)}
                    />
                  </div>

                  <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsSyncModalOpen(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadPreview}
                      disabled={loading}
                      className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-550 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {loading ? 'Fetching...' : 'Load & Preview'}
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Preview list */}
              {syncStep === 'preview' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/20 px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                    <div className="text-xs">
                      <span className="font-bold text-indigo-700 dark:text-indigo-400">Preview Results:</span>{' '}
                      <span className="text-slate-500">
                        Found {previewItems.length} items. {previewItems.filter(i => i.status === 'overwrite').length} need updating.
                      </span>
                    </div>
                  </div>

                  <div className="max-h-[300px] overflow-y-auto border border-slate-100 dark:border-slate-855 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-955/40 text-[10px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-100 dark:border-slate-855">
                          <th className="p-3">SKU</th>
                          <th className="p-3">Product Name</th>
                          <th className="p-3 text-center">Old Stock</th>
                          <th className="p-3 text-center">New Stock</th>
                          <th className="p-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-855 text-xs font-medium">
                        {previewItems.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-850/10">
                            <td className="p-3 font-mono text-[10px] text-slate-500">{item.sku}</td>
                            <td className="p-3 truncate max-w-[150px]">{item.name}</td>
                            <td className="p-3 text-center text-slate-400">{item.status === 'not_found' ? '-' : item.oldStock}</td>
                            <td className="p-3 text-center text-slate-800 dark:text-slate-200">
                              {item.status === 'not_found' ? '-' : (
                                <span className={item.oldStock !== item.newStock ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}>
                                  {item.newStock}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {item.status === 'overwrite' ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">
                                  Update
                                </span>
                              ) : item.status === 'no_change' ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/10 uppercase">
                                  No Change
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 uppercase" title="Product SKU not found in database">
                                  Not Found
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="pt-4 flex justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => setSyncStep('input')}
                      className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
                    >
                      Back
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsSyncModalOpen(false)}
                        className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg uppercase tracking-wider transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleStartSync}
                        disabled={previewItems.filter(i => i.status === 'overwrite').length === 0}
                        className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-555 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50"
                      >
                        Sync Inventory
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Sync progress log */}
              {syncStep === 'syncing' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span>Syncing database records...</span>
                      <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                      <span>Processed: {syncProgress.current} / {syncProgress.total}</span>
                      <span>Success: {syncProgress.success} | Errors: {syncProgress.error}</span>
                    </div>
                  </div>

                  <div className="bg-slate-955 text-slate-200 font-mono text-[10px] p-4 rounded-xl max-h-[180px] overflow-y-auto space-y-1 border border-slate-900 select-text">
                    {syncProgress.log.map((line, i) => (
                      <div key={i} className={line.startsWith('✗') ? 'text-rose-400' : line.startsWith('✓') ? 'text-emerald-400' : 'text-slate-400'}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 4: Sync complete summary */}
              {syncStep === 'complete' && (
                <div className="space-y-4 py-4 text-center">
                  <div className="inline-flex p-3 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 mb-2 border border-emerald-500/20">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="font-extrabold text-lg tracking-tight">Sync Completed Successfully!</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Stock values have been updated. We successfully processed {syncProgress.success} product updates in the database.
                  </p>

                  {syncProgress.error > 0 && (
                    <div className="max-w-sm mx-auto p-3 bg-red-50 dark:bg-red-955/20 border border-red-100 dark:border-red-900/30 rounded-xl text-red-600 text-xs font-semibold">
                      Warning: {syncProgress.error} updates failed. Check logs for details.
                    </div>
                  )}

                  <div className="pt-4 flex justify-center border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => setIsSyncModalOpen(false)}
                      className="px-6 py-2 text-xs font-bold text-white bg-slate-900 dark:bg-slate-800 hover:bg-slate-850 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
                    >
                      Close Sync Wizard
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {syncOption === 'push' && (
            <div className="space-y-4 pt-2">
              {pushingToSheet ? (
                <div className="py-12 text-center flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-550" />
                  <span className="text-sm text-slate-500 font-semibold animate-pulse">
                    Triggering Google Apps Script Web App...
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Syncing live database inventory to your Google Sheet tabs...
                  </span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100/30 dark:border-indigo-900/30 text-xs text-slate-500 leading-relaxed space-y-2">
                    <p className="font-bold text-indigo-600 dark:text-indigo-400">How to configure One-Click Update:</p>
                    <ol className="list-decimal pl-4 space-y-1.5 text-slate-600 dark:text-slate-400">
                      <li>Open your Google Sheet, go to <strong>Extensions &gt; Apps Script</strong>.</li>
                      <li>Replace any default code in the editor with the script code below:
                        <details className="mt-2 bg-slate-100 dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800">
                          <summary className="cursor-pointer font-semibold text-indigo-600 dark:text-indigo-400 select-none">
                            View Apps Script Code
                          </summary>
                          <textarea
                            readOnly
                            value={APPS_SCRIPT_CODE}
                            className="w-full h-40 mt-2 p-2 font-mono text-[10px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded select-all focus:outline-none text-slate-750 dark:text-slate-200"
                            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                          />
                          <p className="mt-1 text-[9px] text-slate-400">Click inside the box to select all, then copy and paste into the editor.</p>
                        </details>
                      </li>
                      <li>In the editor, click the blue <strong>Deploy</strong> button at the top-right, and select <strong>New deployment</strong>.</li>
                      <li>Click the gear icon (Configuration) next to "Select type", and select <strong>Web app</strong>.</li>
                      <li>Set <strong>Execute as</strong> to <code>Me (your email)</code>, and set <strong>Who has access</strong> to <code>Anyone</code>.</li>
                      <li>Click <strong>Deploy</strong>, authorize the access if prompted, and copy the generated <strong>Web App URL</strong>.</li>
                      <li>Paste that URL in the input field below.</li>
                    </ol>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500 block">Google Sheet URL (Optional if container-bound, Required if standalone)</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-405 text-slate-700 dark:text-slate-200"
                        placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                        value={sheetUrl}
                        onChange={(e) => handleSheetUrlChange(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500 block">Google Apps Script Web App URL</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-405 text-slate-700 dark:text-slate-200"
                        placeholder="https://script.google.com/macros/s/.../exec"
                        value={appsScriptUrl}
                        onChange={(e) => handleAppsScriptUrlChange(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsSyncModalOpen(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handlePushToGoogleSheet}
                      className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-555 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Push to Sheet Now
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Sold From Warehouse Modal */}
      <Modal
        isOpen={isWarehouseSoldOpen}
        onClose={() => setIsWarehouseSoldOpen(false)}
        title="Sold From Warehouse"
      >
        <form onSubmit={handleWarehouseSoldSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Product SKU Code *</label>
            <input
              type="text"
              required
              className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase font-mono text-slate-700 dark:text-slate-200"
              placeholder="e.g. SG-F-1732-BLACK"
              value={warehouseSku}
              onChange={(e) => {
                setWarehouseSku(e.target.value);
                const product = products.find(p => p.sku.toLowerCase().trim() === e.target.value.toLowerCase().trim());
                if (product) {
                  const sizes = getCategorySizes(product.category_id);
                  if (sizes.length > 0) setWarehouseSize(sizes[0]);
                  setWarehousePrice(String(product.selling_price));
                } else {
                  setWarehouseSize('');
                  setWarehousePrice('');
                }
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Size *</label>
            <select
              required
              className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-200"
              value={warehouseSize}
              onChange={(e) => setWarehouseSize(e.target.value)}
            >
              <option value="">-- Select Size --</option>
              {(() => {
                const product = products.find(p => p.sku.toLowerCase().trim() === warehouseSku.toLowerCase().trim());
                if (product) {
                  const sizes = getCategorySizes(product.category_id);
                  return sizes.map(sz => (
                    <option key={sz} value={sz} className="dark:bg-slate-900">
                      Size {sz} (Avl Stock: {product.size_stocks?.[sz] || 0})
                    </option>
                  ));
                }
                return ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'].map(sz => (
                  <option key={sz} value={sz} className="dark:bg-slate-900">Size {sz}</option>
                ));
              })()}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Selling Price (₹) *</label>
            <input
              type="number"
              step="0.01"
              required
              min="0"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
              placeholder="0.00"
              value={warehousePrice}
              onChange={(e) => setWarehousePrice(e.target.value)}
            />
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl text-[10px] leading-relaxed font-semibold">
            Note: Selling from warehouse will record this transaction under Sales history. However, it will NOT decrement the stock quantities in your inventory catalog.
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsWarehouseSoldOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={warehouseSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-550 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center min-w-[120px]"
            >
              {warehouseSubmitting ? 'Recording...' : 'Record Sale'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Summary Modal for Inventory Import */}
      <Modal
        isOpen={isImportConfirmModalOpen}
        onClose={() => {
          if (!importingState) setIsImportConfirmModalOpen(false);
        }}
        title="📋 Confirm Inventory Excel Import"
      >
        <div className="flex flex-col gap-5 select-none font-sans text-slate-800 dark:text-slate-100">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Below is the category-wise summary auto-detected from your uploaded Excel report. Please review the total pair counts before confirming the database stock update.
          </p>

          {/* Grand Stats Ribbon */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20">
            <div className="flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-500">Categories</span>
              <span className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{importCategorySummaries.length}</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center border-x border-slate-200 dark:border-slate-800 px-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-purple-500">Articles</span>
              <span className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{importParsedArticles.length}</span>
            </div>
            <div className="flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-500">Total Stock</span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {importCategorySummaries.reduce((sum, s) => sum + s.totalPairs, 0)} Pairs
              </span>
            </div>
          </div>

          {/* Category Breakdown List */}
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Category-Wise Breakdown:</span>
            <div className="space-y-2">
              {importCategorySummaries.map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{cat.categoryName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{cat.articleCount} Articles</span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
                      {cat.totalPairs} Pairs Total
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 mt-2">
            <button
              type="button"
              disabled={importingState}
              onClick={() => setIsImportConfirmModalOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={importingState}
              onClick={executeImportInventory}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-bold text-xs tracking-wider uppercase shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              {importingState ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Updating Database...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm & Update Stock
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
