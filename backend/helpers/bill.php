<?php
require_once __DIR__ . '/response.php';

// Sales bill maths (frontend/src/utils/bill.js mirrors this for the live preview).
// Prices include GST: the bill discount is shared across lines by value, then GST is backed out
// of each line at its product's rate and split equally into CGST and SGST. The total is rounded to the rupee.
// $lines: [['amount' => qty × rate incl. GST, after the line's own discount, 'gst_percent' => 5, ...], ...]
function compute_bill(array $lines, string $discountType, float $discountValue): array
{
    $subtotal = round(array_sum(array_column($lines, 'amount')), 2);
    $discount = $discountType === 'percent' ? round($subtotal * $discountValue / 100, 2) : round($discountValue, 2);
    if ($discount > $subtotal) throw new HttpError('Discount cannot exceed the subtotal');
    $net = round($subtotal - $discount, 2);

    $left = $discount;
    $taxable = 0.0;
    $gst = 0.0;
    $last = count($lines) - 1;
    foreach ($lines as $i => &$l) {
        // Last line takes whatever paise are left so the shares add up exactly.
        $share = $i === $last ? $left : ($subtotal > 0 ? round($discount * $l['amount'] / $subtotal, 2) : 0.0);
        $left = round($left - $share, 2);
        $lineNet = round($l['amount'] - $share, 2);
        $l['taxable_amount'] = round($lineNet * 100 / (100 + $l['gst_percent']), 2);
        $l['gst_amount'] = round($lineNet - $l['taxable_amount'], 2);
        $taxable += $l['taxable_amount'];
        $gst += $l['gst_amount'];
    }
    unset($l);

    $cgst = round($gst / 2, 2);
    $total = round($net);
    return [
        'lines'     => $lines,
        'subtotal'  => $subtotal,
        'discount'  => $discount,
        'taxable'   => round($taxable, 2),
        'gst'       => round($gst, 2),
        'cgst'      => $cgst,
        'sgst'      => round($gst - $cgst, 2),
        'round_off' => round($total - $net, 2),
        'total'     => $total,
    ];
}
