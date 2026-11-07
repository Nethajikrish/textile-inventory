import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// Code 128 barcode drawn as SVG. It stretches to the size given by className/style,
// so the same component works on small thermal stickers and A4 sheets.
export default function Barcode({ value, className = '', style }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !value) return;
    try {
      JsBarcode(svg, value, { format: 'CODE128', displayValue: false, margin: 0, width: 2, height: 60 });
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('preserveAspectRatio', 'none');
    } catch {
      svg.innerHTML = '';
    }
  }, [value]);

  // JsBarcode overwrites the svg's style attribute, so the size goes on a wrapper.
  return <div className={className} style={style}><svg ref={ref} /></div>;
}
