<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/stock.php';

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

        $from_sql = "FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE $where";
        $count = db()->prepare("SELECT COUNT(*) $from_sql");
        $count->execute($params);
        $stmt = db()->prepare("SELECT s.id, s.invoice_no, s.sale_date, s.total_amount, s.status, COALESCE(c.name, 'Walk-in customer') AS customer
                               $from_sql ORDER BY s.sale_date DESC, s.id DESC LIMIT $per OFFSET $offset");
        $stmt->execute($params);

        ok(['items' => $stmt->fetchAll(), 'total' => (int)$count->fetchColumn(), 'page' => $page, 'per_page' => $per]);
    }

    public static function show(int $id): void
    {
        $s = db()->prepare(
            "SELECT s.*, COALESCE(c.name, 'Walk-in customer') AS customer, c.phone AS customer_phone, c.email AS customer_email,
                    c.gstin AS customer_gstin, c.address AS customer_address, u.name AS created_by_name
             FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
             LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?"
        );
        $s->execute([$id]);
        $sale = $s->fetch();
        if (!$sale) fail('Invoice not found', 404);

        $s = db()->prepare(
            'SELECT i.*, p.sku, p.name, p.color, p.lot_no, u.short_name AS unit
             FROM sale_items i JOIN products p ON p.id = i.product_id JOIN units u ON u.id = p.unit_id
             WHERE i.sale_id = ? ORDER BY i.id'
        );
        $s->execute([$id]);
        $sale['items'] = $s->fetchAll();
        ok($sale);
    }

    public static function store(array $user): void
    {
        $in = input();
        $customerId = (int)($in['customer_id'] ?? 0) ?: null; // empty = walk-in customer
        $date = $in['sale_date'] ?? '';
        $taxPercent = round((float)($in['tax_percent'] ?? 0), 2);
        if (!valid_date($date)) fail('Enter a valid invoice date', 422);
        if ($taxPercent < 0 || $taxPercent > 100) fail('Tax % must be between 0 and 100', 422);
        $discountType = ($in['discount_type'] ?? 'percent') === 'amount' ? 'amount' : 'percent';
        $discountValue = round((float)($in['discount_value'] ?? 0), 2);
        if ($discountValue < 0) fail('Offer cannot be negative', 422);
        if ($discountType === 'percent' && $discountValue > 100) fail('Offer % must be between 0 and 100', 422);
        $items = validated_items($in['items'] ?? null);

        // Offer is deducted from the subtotal; GST is charged on what remains.
        $subtotal = round(array_sum(array_column($items, 'amount')), 2);
        $discount = $discountType === 'percent' ? round($subtotal * $discountValue / 100, 2) : $discountValue;
        if ($discount > $subtotal) fail('Offer amount cannot exceed the subtotal', 422);
        $taxable = $subtotal - $discount;
        $tax = round($taxable * $taxPercent / 100, 2);

        try {
            $result = tx(function (PDO $pdo) use ($in, $customerId, $date, $taxPercent, $items, $user,
                                                  $subtotal, $discountType, $discountValue, $discount, $taxable, $tax) {
                $no = next_doc_no('sales', 'invoice_no', 'INV');
                $pdo->prepare('INSERT INTO sales (invoice_no, customer_id, sale_date, subtotal, discount_type, discount_value,
                                 discount_amount, tax_percent, tax_amount, total_amount, notes, created_by)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$no, $customerId, $date, $subtotal, $discountType, $discountValue, $discount,
                               $taxPercent, $tax, $taxable + $tax, trim($in['notes'] ?? '') ?: null, $user['id']]);
                $id = (int)$pdo->lastInsertId();

                $ins = $pdo->prepare('INSERT INTO sale_items (sale_id, product_id, qty, rate, amount) VALUES (?, ?, ?, ?, ?)');
                foreach ($items as $it) {
                    $ins->execute([$id, $it['product_id'], $it['qty'], $it['rate'], $it['amount']]);
                    stock_move($it['product_id'], 'sale', $id, 0, $it['qty'], "Invoice $no", $user['id']);
                }
                return ['id' => $id, 'invoice_no' => $no];
            });
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('Unknown customer or product', 422);
            throw $e;
        }
        ok($result, 'Invoice created', 201);
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
