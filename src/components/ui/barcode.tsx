'use client';

import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeProps {
  value: string;
  className?: string;
}

export default function Barcode({ value, className = '' }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          lineColor: '#000000',
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 10,
          background: 'transparent',
          margin: 4
        });
      } catch (err) {
        console.error('Error generating barcode for value:', value, err);
      }
    }
  }, [value]);

  if (!value) return null;

  return (
    <div className={`inline-block bg-white p-1.5 rounded-lg border border-slate-200 ${className}`}>
      <svg ref={svgRef} className="mx-auto" />
    </div>
  );
}
