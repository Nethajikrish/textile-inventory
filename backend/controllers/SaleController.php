<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/stock.php';
require_once __DIR__ . '/../helpers/bill.php';

// Sales invoices: saving one removes the stock; cancelling puts it back.
class SaleController
{
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
                                      COALESCE(c.name, 'Walk-in customer') AS customer, k.name AS counter
                               $from_sql ORDER BY s.sale_date DESC, s.id DESC LIMIT $per OFFSET $offset");
        $stmt->execute($params);

        ok(['items' => $stmt->fetchAll(), 'total' => (int)$count->fetchColumn(), 'page' => $page, 'per_page' => $per]);
    }

    public static function show(int $id): void
    {
        $s = db()->prepare(
            "SELECT s.*, COALESCE(c.name, 'Walk-in customer') AS customer, c.phone AS customer_phone, c.email AS customer_email,
                    c.gstin AS customer_gstin, c.address AS customer_address, u.name AS created_by_name, k.name AS counter
             FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
             LEFT JOIN counters k ON k.id = s.counter_id
             LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?"
        );
        $s->execute([$id]);
        $sale = $s->fetch();
        if (!$sale) fail('Invoice not found', 404);

        $s = db()->prepare(
            'SELECT i.*, p.sku, p.name, p.brand, p.model, p.color, p.size, p.lot_no, u.short_name AS unit
             FROM sale_items i JOIN products p ON p.id = i.product_id JOIN units u ON u.id = p.unit_id
             WHERE i.sale_id = ? ORDER BY i.id'
        );
        $s->execute([$id]);
        $sale['items'] = $s->fetchAll();
        ok($sale);
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
        $items = validated_items($in['items'] ?? null);

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
            $result = tx(function (PDO $pdo) use ($in, $customerId, $counterId, $date, $time, $discountType, $discountValue, $bill, $user) {
                $no = next_doc_no('sales', 'invoice_no', 'INV');
                $pdo->prepare('INSERT INTO sales (invoice_no, customer_id, counter_id, sale_date, sale_time, subtotal, discount_type,
                                 discount_value, discount_amount, gst_inclusive, taxable_amount, tax_percent, tax_amount,
                                 cgst_amount, sgst_amount, round_off, total_amount, notes, created_by)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$no, $customerId, $counterId, $date, $time, $bill['subtotal'], $discountType, $discountValue,
                               $bill['discount'], $bill['taxable'], $bill['gst'], $bill['cgst'], $bill['sgst'],
                               $bill['round_off'], $bill['total'], trim($in['notes'] ?? '') ?: null, $user['id']]);
                $id = (int)$pdo->lastInsertId();

                $ins = $pdo->prepare('INSERT INTO sale_items (sale_id, product_id, qty, mrp, rate, amount, gst_percent, taxable_amount, gst_amount)
                                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($bill['lines'] as $it) {
                    $ins->execute([$id, $it['product_id'], $it['qty'], $it['mrp'], $it['rate'], $it['amount'],
                                   $it['gst_percent'], $it['taxable_amount'], $it['gst_amount']]);
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
