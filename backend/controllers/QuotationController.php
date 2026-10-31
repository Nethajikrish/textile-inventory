<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/stock.php';
require_once __DIR__ . '/../helpers/bill.php';
require_once __DIR__ . '/PurchaseController.php';

// Quotations from suppliers (become purchase orders) and to customers (become sales bills).
// They never change stock. Customer quotations are worked out like a bill, so the bill matches the quote.
class QuotationController
{
    private const PREFIX = ['supplier' => 'SQ', 'customer' => 'QT'];

    // Same rules as what the quotation leads to: purchases need Admin/Manager, any role can invoice.
    private static function allow(string $type, array $user): void
    {
        if ($type === 'supplier' && !in_array($user['role'], ['Admin', 'Manager'], true)) fail('Forbidden', 403);
    }

    public static function index(): void
    {
        [$page, $per, $offset] = paging();
        [$from, $to] = date_range();
        $type = ($_GET['type'] ?? '') === 'supplier' ? 'supplier' : 'customer';
        $where = 'q.type = ?';
        $params = [$type];
        if (($search = trim($_GET['search'] ?? '')) !== '') {
            $where .= " AND (q.quote_no LIKE ? OR COALESCE(sp.name, c.name, 'Walk-in customer') LIKE ?)";
            array_push($params, "%$search%", "%$search%");
        }
        if (in_array($_GET['status'] ?? '', ['open', 'converted', 'cancelled'], true)) {
            $where .= ' AND q.status = ?';
            $params[] = $_GET['status'];
        }
        if ($from) { $where .= ' AND q.quote_date >= ?'; $params[] = $from; }
        if ($to)   { $where .= ' AND q.quote_date <= ?'; $params[] = $to; }

        $from_sql = "FROM quotations q LEFT JOIN suppliers sp ON sp.id = q.supplier_id LEFT JOIN customers c ON c.id = q.customer_id WHERE $where";
        $count = db()->prepare("SELECT COUNT(*) $from_sql");
        $count->execute($params);
        $stmt = db()->prepare("SELECT q.id, q.quote_no, q.type, q.quote_date, q.valid_until, q.total_amount, q.status, q.converted_id,
                                      COALESCE(sp.name, c.name, 'Walk-in customer') AS party,
                                      CASE q.type WHEN 'supplier' THEN (SELECT p.purchase_no FROM purchases p WHERE p.id = q.converted_id)
                                                  ELSE (SELECT s.invoice_no FROM sales s WHERE s.id = q.converted_id) END AS converted_no
                               $from_sql ORDER BY q.quote_date DESC, q.id DESC LIMIT $per OFFSET $offset");
        $stmt->execute($params);

        ok(['items' => $stmt->fetchAll(), 'total' => (int)$count->fetchColumn(), 'page' => $page, 'per_page' => $per]);
    }

    public static function show(int $id): void
    {
        $s = db()->prepare(
            "SELECT q.*, COALESCE(sp.name, c.name, 'Walk-in customer') AS party,
                    COALESCE(sp.phone, c.phone) AS party_phone, COALESCE(sp.gstin, c.gstin) AS party_gstin,
                    COALESCE(sp.address, c.address) AS party_address, u.name AS created_by_name,
                    CASE q.type WHEN 'supplier' THEN (SELECT p.purchase_no FROM purchases p WHERE p.id = q.converted_id)
                                ELSE (SELECT x.invoice_no FROM sales x WHERE x.id = q.converted_id) END AS converted_no
             FROM quotations q LEFT JOIN suppliers sp ON sp.id = q.supplier_id LEFT JOIN customers c ON c.id = q.customer_id
             LEFT JOIN users u ON u.id = q.created_by WHERE q.id = ?"
        );
        $s->execute([$id]);
        $quote = $s->fetch();
        if (!$quote) fail('Quotation not found', 404);

        $s = db()->prepare(
            'SELECT i.*, p.sku, p.name, p.brand, p.color, p.size, p.lot_no, p.is_active, u.short_name AS unit
             FROM quotation_items i JOIN products p ON p.id = i.product_id JOIN units u ON u.id = p.unit_id
             WHERE i.quotation_id = ? ORDER BY i.id'
        );
        $s->execute([$id]);
        $quote['items'] = $s->fetchAll();
        ok($quote);
    }

    public static function store(array $user): void
    {
        $in = input();
        $type = ($in['type'] ?? '') === 'supplier' ? 'supplier' : 'customer';
        self::allow($type, $user);
        $d = self::validated($type, $in);

        $result = self::write(function (PDO $pdo) use ($type, $d, $in, $user) {
            $no = next_doc_no('quotations', 'quote_no', self::PREFIX[$type]);
            $pdo->prepare('INSERT INTO quotations (quote_no, type, supplier_id, customer_id, quote_date, valid_until, subtotal, discount_type,
                             discount_value, discount_amount, taxable_amount, cgst_amount, sgst_amount, round_off, total_amount, notes, created_by)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$no, $type, ...self::fields($d), trim($in['notes'] ?? '') ?: null, $user['id']]);
            $id = (int)$pdo->lastInsertId();
            self::insertLines($id, $d['lines']);
            return ['id' => $id, 'quote_no' => $no];
        });
        ok($result, "Quotation {$result['quote_no']} saved", 201);
    }

    public static function update(int $id, array $user): void
    {
        $in = input();
        $d = self::validated(self::typeOf($id, $user), $in);

        self::write(function (PDO $pdo) use ($id, $d, $in) {
            self::lockOpen($id);
            $pdo->prepare('UPDATE quotations SET supplier_id = ?, customer_id = ?, quote_date = ?, valid_until = ?, subtotal = ?, discount_type = ?,
                             discount_value = ?, discount_amount = ?, taxable_amount = ?, cgst_amount = ?, sgst_amount = ?, round_off = ?,
                             total_amount = ?, notes = ? WHERE id = ?')
                ->execute([...self::fields($d), trim($in['notes'] ?? '') ?: null, $id]);
            $pdo->prepare('DELETE FROM quotation_items WHERE quotation_id = ?')->execute([$id]);
            self::insertLines($id, $d['lines']);
        });
        ok(null, 'Quotation updated');
    }

    public static function cancel(int $id, array $user): void
    {
        self::typeOf($id, $user);
        tx(function (PDO $pdo) use ($id) {
            self::lockOpen($id);
            $pdo->prepare("UPDATE quotations SET status = 'cancelled' WHERE id = ?")->execute([$id]);
        });
        ok(null, 'Quotation cancelled');
    }

    // Supplier quotation -> purchase order at the quoted rates. Stock goes up only when the goods are received.
    // A customer quotation becomes a bill through the New Invoice screen (SaleController::store, quotation_id).
    public static function convert(int $id, array $user): void
    {
        if (self::typeOf($id, $user) !== 'supplier') fail('Customer quotations become a bill on the New Invoice screen', 422);

        $result = tx(function (PDO $pdo) use ($id, $user) {
            $q = self::lockOpen($id);
            $s = $pdo->prepare('SELECT i.product_id, i.qty, i.rate, i.amount, p.name, p.is_active
                                FROM quotation_items i JOIN products p ON p.id = i.product_id WHERE i.quotation_id = ?');
            $s->execute([$id]);
            $items = [];
            foreach ($s->fetchAll() as $it) {
                if (!$it['is_active']) throw new HttpError("{$it['name']} has been deleted; edit the quotation first");
                $items[] = ['product_id' => (int)$it['product_id'], 'qty' => (float)$it['qty'], 'rate' => (float)$it['rate'], 'amount' => (float)$it['amount']];
            }
            $notes = trim("From quotation {$q['quote_no']}. " . ($q['notes'] ?? ''));
            $po = PurchaseController::insert(['notes' => $notes], (int)$q['supplier_id'], date('Y-m-d'), $items, false, $user);
            $pdo->prepare("UPDATE quotations SET status = 'converted', converted_id = ? WHERE id = ?")->execute([$po['id'], $id]);
            return $po;
        });
        ok($result, "Purchase order {$result['purchase_no']} created", 201);
    }

    private static function typeOf(int $id, array $user): string
    {
        $s = db()->prepare('SELECT type FROM quotations WHERE id = ?');
        $s->execute([$id]);
        $type = $s->fetchColumn();
        if ($type === false) fail('Quotation not found', 404);
        self::allow($type, $user);
        return $type;
    }

    // Must be called inside tx().
    private static function lockOpen(int $id): array
    {
        $s = db()->prepare('SELECT quote_no, supplier_id, status, notes FROM quotations WHERE id = ? FOR UPDATE');
        $s->execute([$id]);
        $q = $s->fetch();
        if (!$q) throw new HttpError('Quotation not found', 404);
        if ($q['status'] !== 'open') throw new HttpError('This quotation is no longer open');
        return $q;
    }

    private static function write(callable $fn)
    {
        try {
            return tx($fn);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('Unknown supplier, customer or product', 422);
            throw $e;
        }
    }

    // The values shared by INSERT and UPDATE, in column order.
    private static function fields(array $d): array
    {
        return [$d['supplier_id'], $d['customer_id'], $d['date'], $d['valid_until'], $d['subtotal'], $d['discount_type'], $d['discount_value'],
                $d['discount'], $d['taxable'], $d['cgst'], $d['sgst'], $d['round_off'], $d['total']];
    }

    private static function insertLines(int $id, array $lines): void
    {
        $ins = db()->prepare('INSERT INTO quotation_items (quotation_id, product_id, qty, mrp, rate, discount_type, discount_value, discount_amount,
                                amount, gst_percent, taxable_amount, gst_amount)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($lines as $it) {
            $ins->execute([$id, $it['product_id'], $it['qty'], $it['mrp'] ?? 0, $it['rate'], $it['discount_type'] ?? 'percent', $it['discount_value'] ?? 0,
                           $it['discount_amount'] ?? 0, $it['amount'], $it['gst_percent'] ?? 0, $it['taxable_amount'] ?? 0, $it['gst_amount'] ?? 0]);
        }
    }

    private static function validated(string $type, array $in): array
    {
        $date = $in['quote_date'] ?? '';
        if (!valid_date($date)) fail('Enter a valid quotation date', 422);
        $validUntil = trim((string)($in['valid_until'] ?? '')) ?: null;
        if ($validUntil && (!valid_date($validUntil) || $validUntil < $date)) fail('Valid until must be on or after the quotation date', 422);
        $common = ['date' => $date, 'valid_until' => $validUntil];

        if ($type === 'supplier') {
            $supplierId = (int)($in['supplier_id'] ?? 0) ?: null;
            if (!$supplierId) fail('Select the supplier', 422);
            $lines = validated_items($in['items'] ?? null);
            $total = round(array_sum(array_column($lines, 'amount')), 2);
            return $common + [
                'supplier_id' => $supplierId, 'customer_id' => null, 'lines' => $lines, 'subtotal' => $total, 'discount_type' => 'percent', 'discount_value' => 0,
                'discount' => 0, 'taxable' => 0, 'cgst' => 0, 'sgst' => 0, 'round_off' => 0, 'total' => $total,
            ];
        }

        [$discountType, $discountValue] = validated_bill_discount($in);
        $bill = compute_bill(with_product_master(validated_items($in['items'] ?? null, true)), $discountType, $discountValue);
        return $common + $bill + [
            'supplier_id' => null, 'customer_id' => (int)($in['customer_id'] ?? 0) ?: null, 'discount_type' => $discountType, 'discount_value' => $discountValue,
        ];
    }
}
