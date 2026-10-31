<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/stock.php';
require_once __DIR__ . '/../helpers/bill.php';

// Sales invoices: saving one removes the stock; cancelling or returning puts it back.
class SaleController
{
    // Goods can be returned for a refund or exchange up to this many days after the bill date.
    private const RETURN_DAYS = 7;

    private static function returnUntil(string $saleDate): string
    {
        return date('Y-m-d', strtotime($saleDate . ' +' . self::RETURN_DAYS . ' days'));
    }

    private static function returnable(array $sale): bool
    {
        return $sale['status'] === 'completed' && date('Y-m-d') <= self::returnUntil($sale['sale_date']);
    }

    public static function index(): void
    {
        [$page, $per, $offset] = paging();
        [$from, $to] = date_range();
        $where = '1 = 1';
        $params = [];
        if (($search = trim($_GET['search'] ?? '')) !== '') {
            $where .= " AND (s.invoice_no LIKE ? OR COALESCE(c.name, 'Walk-in customer') LIKE ?)";
            array_push($params, "%$search%", "%$search%");
        }
        if (in_array($_GET['status'] ?? '', ['completed', 'cancelled'], true)) {
            $where .= ' AND s.status = ?';
            $params[] = $_GET['status'];
        }
        if ($from) { $where .= ' AND s.sale_date >= ?'; $params[] = $from; }
        if ($to)   { $where .= ' AND s.sale_date <= ?'; $params[] = $to; }

        $from_sql = "FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN counters k ON k.id = s.counter_id WHERE $where";
        $count = db()->prepare("SELECT COUNT(*) $from_sql");
        $count->execute($params);
        $stmt = db()->prepare("SELECT s.id, s.invoice_no, s.sale_date, s.sale_time, s.total_amount, s.status,
                                      COALESCE(c.name, 'Walk-in customer') AS customer, k.name AS counter,
                                      (SELECT COALESCE(SUM(r.amount), 0) FROM sale_returns r WHERE r.sale_id = s.id) AS returned_amount
                               $from_sql ORDER BY s.sale_date DESC, s.id DESC LIMIT $per OFFSET $offset");
        $stmt->execute($params);
        $rows = array_map(fn($r) => $r + ['returnable' => self::returnable($r)], $stmt->fetchAll());

        ok(['items' => $rows, 'total' => (int)$count->fetchColumn(), 'page' => $page, 'per_page' => $per]);
    }

    public static function show(int $id): void
    {
        $s = db()->prepare(
            "SELECT s.*, COALESCE(c.name, 'Walk-in customer') AS customer, c.phone AS customer_phone, c.email AS customer_email,
                    c.gstin AS customer_gstin, c.address AS customer_address, u.name AS created_by_name, k.name AS counter,
                    (SELECT r.return_no FROM sale_returns r WHERE r.exchange_sale_id = s.id LIMIT 1) AS exchange_return_no
             FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
             LEFT JOIN counters k ON k.id = s.counter_id
             LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?"
        );
        $s->execute([$id]);
        $sale = $s->fetch();
        if (!$sale) fail('Invoice not found', 404);

        $s = db()->prepare(
            'SELECT i.*, p.sku, p.name, p.brand, p.model, p.color, p.size, p.lot_no, u.short_name AS unit,
                    (SELECT COALESCE(SUM(ri.qty), 0) FROM sale_return_items ri WHERE ri.sale_item_id = i.id) AS returned_qty
             FROM sale_items i JOIN products p ON p.id = i.product_id JOIN units u ON u.id = p.unit_id
             WHERE i.sale_id = ? ORDER BY i.id'
        );
        $s->execute([$id]);
        $sale['items'] = $s->fetchAll();

        $s = db()->prepare('SELECT id, return_no, return_date, type, amount FROM sale_returns WHERE sale_id = ? ORDER BY id');
        $s->execute([$id]);
        $sale['returns'] = $s->fetchAll();
        $sale['return_days'] = self::RETURN_DAYS;
        $sale['return_until'] = self::returnUntil($sale['sale_date']);
        $sale['returnable'] = self::returnable($sale);
        ok($sale);
    }

    // GET /returns?search=
    public static function returns(): void
    {
        [$page, $per, $offset] = paging();
        $where = '1 = 1';
        $params = [];
        if (($search = trim($_GET['search'] ?? '')) !== '') {
            $where .= " AND (r.return_no LIKE ? OR s.invoice_no LIKE ? OR COALESCE(c.name, 'Walk-in customer') LIKE ?)";
            $params = array_fill(0, 3, "%$search%");
        }
        $from_sql = "FROM sale_returns r JOIN sales s ON s.id = r.sale_id LEFT JOIN customers c ON c.id = s.customer_id WHERE $where";
        $count = db()->prepare("SELECT COUNT(*) $from_sql");
        $count->execute($params);
        $stmt = db()->prepare("SELECT r.id, r.return_no, r.return_date, r.type, r.amount, r.exchange_sale_id, r.sale_id, s.invoice_no,
                                      COALESCE(c.name, 'Walk-in customer') AS customer,
                                      (SELECT x.invoice_no FROM sales x WHERE x.id = r.exchange_sale_id) AS exchange_invoice_no,
                                      (SELECT SUM(ri.qty) FROM sale_return_items ri WHERE ri.return_id = r.id) AS qty
                               $from_sql ORDER BY r.id DESC LIMIT $per OFFSET $offset");
        $stmt->execute($params);

        ok(['items' => $stmt->fetchAll(), 'total' => (int)$count->fetchColumn(), 'page' => $page, 'per_page' => $per]);
    }

    // An exchange credit, for the New Invoice screen.
    public static function showReturn(int $id): void
    {
        $s = db()->prepare('SELECT r.id, r.return_no, r.type, r.amount, r.exchange_sale_id, s.customer_id, s.invoice_no
                            FROM sale_returns r JOIN sales s ON s.id = r.sale_id WHERE r.id = ?');
        $s->execute([$id]);
        $row = $s->fetch();
        $row ? ok($row) : fail('Return not found', 404);
    }

    // POST /sales/5/returns {type: refund|exchange, items: [{sale_item_id, qty}], notes}
    // Stock comes back at once. The value is what was actually charged for those pieces, after all discounts.
    public static function createReturn(int $saleId, array $user): void
    {
        $in = input();
        $type = $in['type'] ?? '';
        if (!in_array($type, ['refund', 'exchange'], true)) fail('Choose refund or exchange', 422);
        $wanted = [];
        foreach (is_array($in['items'] ?? null) ? $in['items'] : [] as $it) {
            $q = round((float)($it['qty'] ?? 0), 3);
            if ($q < 0) fail('Return quantity cannot be negative', 422);
            if ($q > 0) $wanted[(int)($it['sale_item_id'] ?? 0)] = $q;
        }
        if (!$wanted) fail('Enter the quantity being returned', 422);

        $result = tx(function (PDO $pdo) use ($saleId, $type, $wanted, $in, $user) {
            $s = $pdo->prepare('SELECT invoice_no, sale_date, status, total_amount FROM sales WHERE id = ? FOR UPDATE');
            $s->execute([$saleId]);
            $sale = $s->fetch();
            if (!$sale) throw new HttpError('Invoice not found', 404);
            if ($sale['status'] !== 'completed') throw new HttpError('This invoice is cancelled');
            if (!self::returnable($sale)) {
                throw new HttpError('Return period is over: returns are accepted for ' . self::RETURN_DAYS . ' days from the bill date (last date ' . date('d/m/Y', strtotime(self::returnUntil($sale['sale_date']))) . ')');
            }

            $s = $pdo->prepare('SELECT i.id, i.product_id, i.qty, i.taxable_amount, i.gst_amount, p.name,
                                       (SELECT COALESCE(SUM(ri.qty), 0) FROM sale_return_items ri WHERE ri.sale_item_id = i.id) AS returned_qty
                                FROM sale_items i JOIN products p ON p.id = i.product_id WHERE i.sale_id = ?');
            $s->execute([$saleId]);
            $lines = [];
            foreach ($s->fetchAll() as $l) $lines[(int)$l['id']] = $l;

            $rows = [];
            $value = 0.0;
            foreach ($wanted as $itemId => $q) {
                $l = $lines[$itemId] ?? null;
                if (!$l) throw new HttpError('That item is not on this invoice');
                $left = round((float)$l['qty'] - (float)$l['returned_qty'], 3);
                if ($q > $left) throw new HttpError("{$l['name']}: only " . (float)$left . ' can still be returned');
                $share = $q / (float)$l['qty'];
                $lineValue = round(((float)$l['taxable_amount'] + (float)$l['gst_amount']) * $share, 2);
                $taxable = round((float)$l['taxable_amount'] * $share, 2);
                $rows[] = [$itemId, (int)$l['product_id'], $q, $taxable, round($lineValue - $taxable, 2)];
                $value += $lineValue;
            }

            // Rounded to the rupee like the bill, and never more than is left of what the bill charged.
            $s = $pdo->prepare('SELECT COALESCE(SUM(amount), 0) FROM sale_returns WHERE sale_id = ?');
            $s->execute([$saleId]);
            $amount = min(round($value), max(0.0, (float)$sale['total_amount'] - (float)$s->fetchColumn()));

            $no = next_doc_no('sale_returns', 'return_no', 'RET');
            $pdo->prepare('INSERT INTO sale_returns (return_no, sale_id, return_date, type, amount, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
                ->execute([$no, $saleId, date('Y-m-d'), $type, $amount, trim($in['notes'] ?? '') ?: null, $user['id']]);
            $id = (int)$pdo->lastInsertId();

            $ins = $pdo->prepare('INSERT INTO sale_return_items (return_id, sale_item_id, product_id, qty, taxable_amount, gst_amount) VALUES (?, ?, ?, ?, ?, ?)');
            foreach ($rows as $r) {
                $ins->execute([$id, ...$r]);
                stock_move($r[1], 'return', $id, $r[2], 0, "Return $no against {$sale['invoice_no']}", $user['id']);
            }
            return ['id' => $id, 'return_no' => $no, 'type' => $type, 'amount' => $amount];
        });
        ok($result, "Return {$result['return_no']} saved", 201);
    }

    // The bill number the next invoice will get (shown on the New Invoice screen; assigned on save).
    public static function nextNumber(): void
    {
        ok(['invoice_no' => next_doc_no('sales', 'invoice_no', 'INV')]);
    }

    public static function store(array $user): void
    {
        $in = input();
        $customerId = (int)($in['customer_id'] ?? 0) ?: null; // empty = walk-in customer
        $counterId = (int)($in['counter_id'] ?? 0) ?: null;
        $date = $in['sale_date'] ?? '';
        $time = trim((string)($in['sale_time'] ?? '')) ?: date('H:i:s');
        if (!valid_date($date)) fail('Enter a valid bill date', 422);
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $time)) fail('Enter a valid bill time', 422);
        $discountType = ($in['discount_type'] ?? 'percent') === 'amount' ? 'amount' : 'percent';
        $discountValue = round((float)($in['discount_value'] ?? 0), 2);
        if ($discountValue < 0) fail('Discount cannot be negative', 422);
        if ($discountType === 'percent' && $discountValue > 100) fail('Discount % must be between 0 and 100', 422);
        $items = validated_items($in['items'] ?? null, true);
        $exchangeId = (int)($in['exchange_return_id'] ?? 0) ?: null;

        // MRP and GST rate come from the product master, not the client.
        $ids = array_values(array_unique(array_column($items, 'product_id')));
        $s = db()->prepare('SELECT id, mrp, gst_percent FROM products WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
        $s->execute($ids);
        $master = [];
        foreach ($s->fetchAll() as $p) $master[(int)$p['id']] = $p;
        foreach ($items as &$it) {
            $p = $master[$it['product_id']] ?? null;
            if (!$p) fail('Unknown product', 422);
            $it['gst_percent'] = (float)$p['gst_percent'];
            $it['mrp'] = max((float)$p['mrp'], $it['rate']);
        }
        unset($it);

        $bill = compute_bill($items, $discountType, $discountValue);

        try {
            $result = tx(function (PDO $pdo) use ($in, $customerId, $counterId, $date, $time, $discountType, $discountValue, $bill, $user, $exchangeId) {
                // Each exchange credit can be used on one bill only.
                $credit = 0.0;
                if ($exchangeId) {
                    $s = $pdo->prepare("SELECT amount FROM sale_returns WHERE id = ? AND type = 'exchange' AND exchange_sale_id IS NULL FOR UPDATE");
                    $s->execute([$exchangeId]);
                    $credit = $s->fetchColumn();
                    if ($credit === false) throw new HttpError('This exchange credit is not available');
                }

                $no = next_doc_no('sales', 'invoice_no', 'INV');
                $pdo->prepare('INSERT INTO sales (invoice_no, customer_id, counter_id, sale_date, sale_time, subtotal, discount_type,
                                 discount_value, discount_amount, gst_inclusive, taxable_amount, tax_percent, tax_amount,
                                 cgst_amount, sgst_amount, round_off, total_amount, exchange_credit, notes, created_by)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$no, $customerId, $counterId, $date, $time, $bill['subtotal'], $discountType, $discountValue,
                               $bill['discount'], $bill['taxable'], $bill['gst'], $bill['cgst'], $bill['sgst'],
                               $bill['round_off'], $bill['total'], $credit, trim($in['notes'] ?? '') ?: null, $user['id']]);
                $id = (int)$pdo->lastInsertId();
                if ($exchangeId) $pdo->prepare('UPDATE sale_returns SET exchange_sale_id = ? WHERE id = ?')->execute([$id, $exchangeId]);

                $ins = $pdo->prepare('INSERT INTO sale_items (sale_id, product_id, qty, mrp, rate, discount_type, discount_value, discount_amount,
                                        amount, gst_percent, taxable_amount, gst_amount)
                                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($bill['lines'] as $it) {
                    $ins->execute([$id, $it['product_id'], $it['qty'], $it['mrp'], $it['rate'], $it['discount_type'], $it['discount_value'],
                                   $it['discount_amount'], $it['amount'], $it['gst_percent'], $it['taxable_amount'], $it['gst_amount']]);
                    stock_move($it['product_id'], 'sale', $id, 0, $it['qty'], "Invoice $no", $user['id']);
                }
                return ['id' => $id, 'invoice_no' => $no];
            });
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('Unknown customer, counter or product', 422);
            throw $e;
        }
        ok($result, "Bill {$result['invoice_no']} saved", 201);
    }

    public static function cancel(int $id, array $user): void
    {
        tx(function (PDO $pdo) use ($id, $user) {
            $s = $pdo->prepare('SELECT invoice_no, status FROM sales WHERE id = ? FOR UPDATE');
            $s->execute([$id]);
            $sale = $s->fetch();
            if (!$sale) throw new HttpError('Invoice not found', 404);
            if ($sale['status'] !== 'completed') throw new HttpError('Invoice is already cancelled');

            // Returned pieces are already back in stock; cancelling would add them twice.
            $s = $pdo->prepare('SELECT COUNT(*) FROM sale_returns WHERE sale_id = ?');
            $s->execute([$id]);
            if ($s->fetchColumn() > 0) throw new HttpError('This invoice has returns and cannot be cancelled');

            // An exchange credit used on this bill can be used again.
            $pdo->prepare('UPDATE sale_returns SET exchange_sale_id = NULL WHERE exchange_sale_id = ?')->execute([$id]);

            $s = $pdo->prepare('SELECT product_id, qty FROM sale_items WHERE sale_id = ?');
            $s->execute([$id]);
            foreach ($s->fetchAll() as $it) {
                stock_move((int)$it['product_id'], 'return', $id, (float)$it['qty'], 0, "Invoice {$sale['invoice_no']} cancelled", $user['id']);
            }
            $pdo->prepare("UPDATE sales SET status = 'cancelled' WHERE id = ?")->execute([$id]);
        });
        ok(null, 'Invoice cancelled; stock restored');
    }
}
