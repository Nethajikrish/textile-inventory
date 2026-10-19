<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/stock.php';

class StockController
{
    // Grouping key => SQL expression. Grouped together with the unit, since metres and kg don't add up.
    private const GROUPS = [
        'product' => 'p.name',
        'color'   => "COALESCE(NULLIF(p.color, ''), '(no color)')",
        'lot'     => "COALESCE(NULLIF(p.lot_no, ''), '(no lot)')",
    ];

    // GET /stock/summary?group=product|color|lot&category_id=
    public static function summary(): void
    {
        $expr = self::GROUPS[$_GET['group'] ?? ''] ?? self::GROUPS['product'];
        $where = 'p.is_active = 1';
        $params = [];
        if (!empty($_GET['category_id'])) {
            $where .= ' AND p.category_id = ?';
            $params[] = (int)$_GET['category_id'];
        }
        $s = db()->prepare(
            "SELECT $expr AS label, u.short_name AS unit, COUNT(*) AS products,
                    SUM(p.stock_qty) AS qty, SUM(p.stock_qty * p.purchase_price) AS value,
                    SUM(p.stock_qty <= p.min_stock) AS low_items
             FROM products p JOIN units u ON u.id = p.unit_id
             WHERE $where GROUP BY label, u.short_name ORDER BY label"
        );
        $s->execute($params);
        ok($s->fetchAll());
    }

    // GET /stock/ledger?product_id=&type=&from=&to=&page=
    public static function ledger(): void
    {
        [$page, $per, $offset] = paging();
        [$from, $to] = date_range();
        $where = '1 = 1';
        $params = [];
        if (!empty($_GET['product_id'])) { $where .= ' AND l.product_id = ?'; $params[] = (int)$_GET['product_id']; }
        if (in_array($_GET['type'] ?? '', ['opening', 'purchase', 'sale', 'adjustment', 'return', 'damage'], true)) {
            $where .= ' AND l.txn_type = ?';
            $params[] = $_GET['type'];
        }
        if ($from) { $where .= ' AND l.created_at >= ?'; $params[] = "$from 00:00:00"; }
        if ($to)   { $where .= ' AND l.created_at <= ?'; $params[] = "$to 23:59:59"; }

        $count = db()->prepare("SELECT COUNT(*) FROM stock_ledger l WHERE $where");
        $count->execute($params);
        $stmt = db()->prepare(
            "SELECT l.*, p.sku, p.name, p.color, p.lot_no, un.short_name AS unit, u.name AS user
             FROM stock_ledger l JOIN products p ON p.id = l.product_id JOIN units un ON un.id = p.unit_id
             LEFT JOIN users u ON u.id = l.created_by
             WHERE $where ORDER BY l.id DESC LIMIT $per OFFSET $offset"
        );
        $stmt->execute($params);
        ok(['items' => $stmt->fetchAll(), 'total' => (int)$count->fetchColumn(), 'page' => $page, 'per_page' => $per]);
    }

    // POST /stock/adjust {product_id, type: damage|return|adjustment, direction: in|out, qty, remarks}
    public static function adjust(array $user): void
    {
        $in = input();
        $productId = (int)($in['product_id'] ?? 0);
        $type = $in['type'] ?? '';
        $qty = round((float)($in['qty'] ?? 0), 3);
        $remarks = trim($in['remarks'] ?? '');

        // Damage always reduces stock, a return always adds it; a manual adjustment can go either way.
        $direction = ['damage' => 'out', 'return' => 'in'][$type] ?? ($in['direction'] ?? '');
        if ($productId <= 0) fail('Select a product', 422);
        if (!in_array($type, ['damage', 'return', 'adjustment'], true)) fail('Invalid adjustment type', 422);
        if (!in_array($direction, ['in', 'out'], true)) fail('Choose whether to add or remove stock', 422);
        if ($qty <= 0) fail('Quantity must be greater than 0', 422);
        if ($type === 'adjustment' && $remarks === '') fail('Give a reason for the adjustment', 422);

        $balance = tx(fn() => stock_move(
            $productId, $type, null,
            $direction === 'in' ? $qty : 0, $direction === 'out' ? $qty : 0,
            mb_substr($remarks, 0, 255) ?: null, $user['id']
        ));
        ok(['balance' => $balance], 'Stock adjusted');
    }

    // GET /stock/alerts — every product at or below its minimum level
    public static function alerts(): void
    {
        ok(db()->query(
            'SELECT p.id, p.sku, p.name, p.color, p.lot_no, p.stock_qty, p.min_stock, u.short_name AS unit
             FROM products p JOIN units u ON u.id = p.unit_id
             WHERE p.is_active = 1 AND p.stock_qty <= p.min_stock ORDER BY (p.stock_qty - p.min_stock) ASC'
        )->fetchAll());
    }
}
