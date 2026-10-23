<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/stock.php';

// Purchase orders: created as "ordered"; receiving goods adds the stock.
class PurchaseController
{
    public static function index(): void
    {
        [$page, $per, $offset] = paging();
        [$from, $to] = date_range();
        $where = '1 = 1';
        $params = [];
        if (($search = trim($_GET['search'] ?? '')) !== '') {
            $where .= " AND (p.purchase_no LIKE ? OR COALESCE(s.name, 'No supplier') LIKE ?)";
            array_push($params, "%$search%", "%$search%");
        }
        if (in_array($_GET['status'] ?? '', ['ordered', 'received', 'cancelled'], true)) {
            $where .= ' AND p.status = ?';
            $params[] = $_GET['status'];
        }
        if ($from) { $where .= ' AND p.purchase_date >= ?'; $params[] = $from; }
        if ($to)   { $where .= ' AND p.purchase_date <= ?'; $params[] = $to; }

        $from_sql = "FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE $where";
        $count = db()->prepare("SELECT COUNT(*) $from_sql");
        $count->execute($params);
        $stmt = db()->prepare("SELECT p.id, p.purchase_no, p.purchase_date, p.total_amount, p.status, COALESCE(s.name, 'No supplier') AS supplier
                               $from_sql ORDER BY p.purchase_date DESC, p.id DESC LIMIT $per OFFSET $offset");
        $stmt->execute($params);

        ok(['items' => $stmt->fetchAll(), 'total' => (int)$count->fetchColumn(), 'page' => $page, 'per_page' => $per]);
    }

    public static function show(int $id): void
    {
        $s = db()->prepare(
            "SELECT p.*, COALESCE(s.name, 'No supplier') AS supplier, s.phone AS supplier_phone, s.email AS supplier_email,
                    s.gstin AS supplier_gstin, s.address AS supplier_address, u.name AS created_by_name
             FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
             LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?"
        );
        $s->execute([$id]);
        $purchase = $s->fetch();
        if (!$purchase) fail('Purchase not found', 404);

        $s = db()->prepare(
            'SELECT i.*, pr.sku, pr.name, pr.color, pr.lot_no, u.short_name AS unit
             FROM purchase_items i JOIN products pr ON pr.id = i.product_id JOIN units u ON u.id = pr.unit_id
             WHERE i.purchase_id = ? ORDER BY i.id'
        );
        $s->execute([$id]);
        $purchase['items'] = $s->fetchAll();
        ok($purchase);
    }

    public static function store(array $user): void
    {
        $in = input();
        $supplierId = (int)($in['supplier_id'] ?? 0) ?: null; // empty = no supplier
        $date = $in['purchase_date'] ?? '';
        if (!valid_date($date)) fail('Enter a valid purchase date', 422);
        $items = validated_items($in['items'] ?? null);
        $receiveNow = !empty($in['receive']);

        try {
            $result = self::create($in, $supplierId, $date, $items, $receiveNow, $user);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('Unknown supplier or product', 422);
            throw $e;
        }
        ok($result, $receiveNow ? 'Purchase saved and stock updated' : 'Purchase order created', 201);
    }

    private static function create(array $in, ?int $supplierId, string $date, array $items, bool $receiveNow, array $user): array
    {
        return tx(function (PDO $pdo) use ($in, $supplierId, $date, $items, $receiveNow, $user) {
            $no = next_doc_no('purchases', 'purchase_no', 'PO');
            $total = array_sum(array_column($items, 'amount'));
            $pdo->prepare('INSERT INTO purchases (purchase_no, supplier_id, purchase_date, total_amount, notes, created_by)
                           VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$no, $supplierId, $date, $total, trim($in['notes'] ?? '') ?: null, $user['id']]);
            $id = (int)$pdo->lastInsertId();

            $ins = $pdo->prepare('INSERT INTO purchase_items (purchase_id, product_id, qty, rate, amount) VALUES (?, ?, ?, ?, ?)');
            foreach ($items as $it) $ins->execute([$id, $it['product_id'], $it['qty'], $it['rate'], $it['amount']]);

            if ($receiveNow) self::doReceive($id, $user);
            return ['id' => $id, 'purchase_no' => $no];
        });
    }

    public static function receive(int $id, array $user): void
    {
        tx(fn() => self::doReceive($id, $user));
        ok(null, 'Goods received; stock updated');
    }

    public static function cancel(int $id): void
    {
        tx(function (PDO $pdo) use ($id) {
            $status = self::lockStatus($id);
            if ($status !== 'ordered') throw new HttpError('Only orders that are not yet received can be cancelled');
            $pdo->prepare("UPDATE purchases SET status = 'cancelled' WHERE id = ?")->execute([$id]);
        });
        ok(null, 'Purchase order cancelled');
    }

    private static function doReceive(int $id, array $user): void
    {
        $pdo = db();
        if (self::lockStatus($id) !== 'ordered') throw new HttpError('This order is not open for receiving');

        $s = $pdo->prepare('SELECT p.purchase_no, i.product_id, i.qty FROM purchase_items i
                            JOIN purchases p ON p.id = i.purchase_id WHERE i.purchase_id = ?');
        $s->execute([$id]);
        foreach ($s->fetchAll() as $it) {
            stock_move((int)$it['product_id'], 'purchase', $id, (float)$it['qty'], 0, "Received {$it['purchase_no']}", $user['id']);
        }
        $pdo->prepare("UPDATE purchases SET status = 'received', received_at = NOW() WHERE id = ?")->execute([$id]);
    }

    private static function lockStatus(int $id): string
    {
        $s = db()->prepare('SELECT status FROM purchases WHERE id = ? FOR UPDATE');
        $s->execute([$id]);
        $status = $s->fetchColumn();
        if ($status === false) throw new HttpError('Purchase not found', 404);
        return $status;
    }
}
