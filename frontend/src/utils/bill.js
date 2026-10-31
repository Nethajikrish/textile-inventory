// Live bill preview. Mirrors backend/helpers/bill.php (the server's numbers are the ones saved).
// Prices include GST: the bill discount is shared across lines by value, GST is backed out of each
// line at its product's rate and split equally into CGST + SGST; the total is rounded to the rupee.

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// A line's own discount: % of qty × rate, or a ₹ amount off the line.
export function lineDiscount(l) {
  const gross = r2((Number(l.qty) || 0) * (Number(l.rate) || 0));
  const v = Number(l.discount_value) || 0;
  return r2(l.discount_type === 'amount' ? v : (gross * v) / 100);
}

export const lineAmount = (l) => r2(r2((Number(l.qty) || 0) * (Number(l.rate) || 0)) - lineDiscount(l));

// lines: [{ amount, gst_percent }]
export function computeBill(lines, discountType, discountValue) {
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const v = Number(discountValue) || 0;
  const discount = r2(discountType === 'percent' ? (subtotal * v) / 100 : v);
  const net = r2(subtotal - discount);

  let left = discount;
  let taxable = 0;
  let gst = 0;
  lines.forEach((l, i) => {
    const share = i === lines.length - 1 ? left : subtotal > 0 ? r2((discount * l.amount) / subtotal) : 0;
    left = r2(left - share);
    const lineNet = r2(l.amount - share);
    const t = r2((lineNet * 100) / (100 + (Number(l.gst_percent) || 0)));
    taxable += t;
    gst += lineNet - t;
  });
  gst = r2(gst);
  const cgst = r2(gst / 2);
  const total = Math.round(net);
  return { subtotal, discount, net, taxable: r2(taxable), gst, cgst, sgst: r2(gst - cgst), roundOff: r2(total - net), total };
}

// Selling price of a product: MRP - discount (GST inclusive).
export function sellingPrice(mrp, discountType, discountValue) {
  const m = Number(mrp) || 0;
  const v = Number(discountValue) || 0;
  return r2(m - (discountType === 'percent' ? (m * v) / 100 : v));
}

// GST summary rows by rate from saved sale items: [{ rate, taxable, cgst, sgst }]
export function gstSummary(items) {
  const byRate = {};
  items.forEach((it) => {
    const rate = Number(it.gst_percent);
    const row = (byRate[rate] ||= { rate, taxable: 0, gst: 0 });
    row.taxable += Number(it.taxable_amount);
    row.gst += Number(it.gst_amount);
  });
  return Object.values(byRate)
    .sort((a, b) => a.rate - b.rate)
    .map((r) => {
      const cgst = r2(r.gst / 2);
      return { rate: r.rate, taxable: r2(r.taxable), cgst, sgst: r2(r.gst - cgst) };
    });
}
