import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serverUrl, username, password, fromDate, toDate } = body;

    if (!serverUrl || !username || !password) {
      return NextResponse.json(
        { success: false, message: 'Logic ERP Server URL, Username, and Password are required.' },
        { status: 400 }
      );
    }

    // Standardize URL
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    
    // 1. Authenticate with Logic ERP API / Web Service
    // Logic ERP Web API standard endpoint for token generation
    let authResponse;
    try {
      authResponse = await fetch(`${cleanUrl}/api/v1/Auth/Login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    } catch (netErr: any) {
      // Fallback: Support custom local IIS proxy endpoints or direct JSON endpoint
      return NextResponse.json({
        success: false,
        message: `Could not reach Logic ERP server at ${cleanUrl}. Make sure the server is online and API service is running. Error: ${netErr.message}`
      }, { status: 502 });
    }

    let token = '';
    if (authResponse.ok) {
      const authData = await authResponse.json();
      token = authData.token || authData.accessToken || authData.data?.token || '';
    }

    // 2. Fetch Sales Invoices / Sale Register Detailed from Logic ERP API
    const defaultFromDate = fromDate || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const defaultToDate = toDate || new Date().toISOString().slice(0, 10);

    const salesApiUrl = `${cleanUrl}/api/v1/Sales/SaleRegisterDetailed?fromDate=${defaultFromDate}&toDate=${defaultToDate}`;
    
    const salesResponse = await fetch(salesApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        'X-Logic-User': username,
        'X-Logic-Password': password,
      },
    });

    if (!salesResponse.ok) {
      // If API route is custom or mock payload for local ERP
      return NextResponse.json({
        success: false,
        message: `Logic ERP Server connected, but returned status ${salesResponse.status}. Please verify Logic ERP Web API module configuration.`
      }, { status: 400 });
    }

    const salesData = await salesResponse.json();
    const rows = Array.isArray(salesData) ? salesData : (salesData.items || salesData.data || []);

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Connected to Logic ERP successfully! No new sales found for the selected date range.',
        syncedCount: 0
      });
    }

    // Fetch existing products catalog from Supabase to match SKUs
    const { data: dbProducts } = await supabase.from('products').select('*');
    const productsCache = dbProducts || [];

    const normalizeCode = (str: string) => (str || '').toLowerCase().trim().replace(/^(sg-?)+/gi, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    let syncedCount = 0;
    const dateGroups: Record<string, any[]> = {};
    const missingCodesSet = new Set<string>();

    // Group sales from Logic ERP by date
    for (const item of rows) {
      const rawSku = item.itemCode || item.sku || item.articleCode || item.ITEM_CODE || '';
      const rawDate = item.billDate || item.date || item.saleDate || item.BILL_DATE || new Date().toISOString();
      const rawPrice = parseFloat(item.netAmount || item.amount || item.price || item.NET_AMOUNT || 0);
      const rawQty = parseInt(item.totalQty || item.qty || item.quantity || item.TOTAL_QTY || 1, 10);
      const rawSize = item.packGrade || item.size || item.PACK_GRADE || '';

      if (!rawSku) continue;

      // Find matching product in database
      const codeNorm = normalizeCode(rawSku);
      const matchedProd = productsCache.find(p => {
        const cleanProdBarcode = normalizeCode(p.barcode);
        const cleanSkuColor = normalizeCode(`${p.sku}-${p.color}`);
        const cleanSku = normalizeCode(p.sku);
        return codeNorm === cleanProdBarcode || codeNorm === cleanSkuColor || codeNorm === cleanSku;
      });

      if (matchedProd) {
        const dateKey = new Date(rawDate).toISOString().slice(0, 10);
        if (!dateGroups[dateKey]) dateGroups[dateKey] = [];

        dateGroups[dateKey].push({
          product: matchedProd,
          rawPrice: rawPrice > 0 ? rawPrice : matchedProd.selling_price,
          rawQty,
          size: rawSize || 'One Size',
          isoDate: new Date(rawDate).toISOString()
        });
        syncedCount++;
      } else {
        missingCodesSet.add(rawSku);
      }
    }

    // Insert date-wise sales into Supabase
    for (const dateKey of Object.keys(dateGroups)) {
      const group = dateGroups[dateKey];
      const dateTotal = group.reduce((sum, item) => sum + (item.rawQty * item.rawPrice), 0);

      const { data: saleRecord, error: saleErr } = await supabase
        .from('sales')
        .insert({
          sale_date: group[0].isoDate,
          total_amount: dateTotal
        })
        .select()
        .single();

      if (!saleErr && saleRecord) {
        for (const item of group) {
          await supabase.from('sale_items').insert({
            sale_id: saleRecord.id,
            product_id: item.product.id,
            size: item.size,
            quantity: item.rawQty,
            selling_price: item.rawPrice
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${syncedCount} sales records from Logic ERP!`,
      syncedCount,
      uniqueDates: Object.keys(dateGroups).length,
      missingCodes: Array.from(missingCodesSet)
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'Internal error syncing Logic ERP: ' + err.message },
      { status: 500 }
    );
  }
}
