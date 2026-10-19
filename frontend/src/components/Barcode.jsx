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
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'none');
    } catch {
      svg.innerHTML = '';
    }
  }, [value]);

  return <svg ref={ref} className={className} style={style} />;
}
