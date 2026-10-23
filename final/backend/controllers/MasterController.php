<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

// Categories & units master data, plus the dashboard summary.
class MasterController
{
    // table => [columns, required columns]
    private const TABLES = [
        'categories' => [['name'], ['name']],
        'units'      => [['name', 'short_name'], ['name', 'short_name']],
    ];

    public static function index(string $table): void
    {
        $cols = implode(', ', self::TABLES[$table][0]);
        ok(db()->query("SELECT id, $cols FROM $table ORDER BY name")->fetchAll());
    }

    public static function store(string $table): void
    {
        $d = self::validated($table, input());
        $cols = array_keys($d);
        $sql = "INSERT INTO $table (" . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')';
        self::write($sql, array_values($d));
        ok(['id' => (int)db()->lastInsertId()], 'Created', 201);
    }

    public static function update(string $table, int $id): void
    {
        $d = self::validated($table, input());
        $set = implode(', ', array_map(fn($c) => "$c = ?", array_keys($d)));
        self::write("UPDATE $table SET $set WHERE id = ?", [...array_values($d), $id]);
        ok(null, 'Updated');
    }

    public static function destroy(string $table, int $id): void
    {
        $col = $table === 'categories' ? 'category_id' : 'unit_id';
        $s = db()->prepare("SELECT COUNT(*) FROM products WHERE $col = ? AND is_active = 1");
        $s->execute([$id]);
        if ($s->fetchColumn() > 0) fail('In use by products; reassign them first', 409);
        try {
            db()->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('In use by older records and cannot be deleted', 409);
            throw $e;
        }
        ok(null, 'Deleted');
    }

    private static function write(string $sql, array $params): void
    {
        try {
            db()->prepare($sql)->execute($params);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('A record with this name already exists', 409);
            throw $e;
        }
    }

    private static function validated(string $table, array $in): array
    {
        [$cols, $required] = self::TABLES[$table];
        $d = [];
        $errors = [];
        foreach ($cols as $c) {
            $d[$c] = trim((string)($in[$c] ?? ''));
            if (in_array($c, $required, true) && $d[$c] === '') $errors[$c] = "$c is required";
        }
        if ($errors) fail('Validation failed', 422, $errors);
        return $d;
    }

    public static function dashboard(): void
    {
        $pdo = db();
        $one = fn(string $sql) => $pdo->query($sql)->fetchColumn();

        // Monthly purchases (received) vs sales (completed) for the last 6 months.
        $months = [];
        for ($i = 5; $i >= 0; $i--) {
            $key = date('Y-m', strtotime("first day of -$i month"));
            $months[$key] = ['month' => date('M Y', strtotime("$key-01")), 'sales' => 0.0, 'purchases' => 0.0];
        }
        $since = array_key_first($months) . '-01';
        $s = $pdo->prepare("SELECT DATE_FORMAT(sale_date, '%Y-%m') m, SUM(total_amount) t FROM sales
                            WHERE status = 'completed' AND sale_date >= ? GROUP BY m");
        $s->execute([$since]);
        foreach ($s as $r) if (isset($months[$r['m']])) $months[$r['m']]['sales'] = (float)$r['t'];
        $s = $pdo->prepare("SELECT DATE_FORMAT(purchase_date, '%Y-%m') m, SUM(total_amount) t FROM purchases
                            WHERE status = 'received' AND purchase_date >= ? GROUP BY m");
        $s->execute([$since]);
        foreach ($s as $r) if (isset($months[$r['m']])) $months[$r['m']]['purchases'] = (float)$r['t'];

        ok([
            'products'        => (int)$one('SELECT COUNT(*) FROM products WHERE is_active = 1'),
            'stock_value'     => (float)$one('SELECT COALESCE(SUM(stock_qty * purchase_price), 0) FROM products WHERE is_active = 1'),
            'low_stock_count' => (int)$one('SELECT COUNT(*) FROM products WHERE is_active = 1 AND stock_qty <= min_stock'),
            'month_sales'     => (float)$one("SELECT COALESCE(SUM(total_amount), 0) FROM sales
                                              WHERE status = 'completed' AND sale_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"),
            'month_purchases' => (float)$one("SELECT COALESCE(SUM(total_amount), 0) FROM purchases
                                              WHERE status = 'received' AND purchase_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"),
            'low_stock'       => $pdo->query(
                'SELECT p.id, p.sku, p.name, p.color, p.lot_no, p.stock_qty, p.min_stock, u.short_name AS unit
                 FROM products p JOIN units u ON u.id = p.unit_id
                 WHERE p.is_active = 1 AND p.stock_qty <= p.min_stock ORDER BY p.stock_qty ASC LIMIT 10'
            )->fetchAll(),
            'recent_purchases' => $pdo->query(
                "SELECT p.id, p.purchase_no, p.purchase_date, p.total_amount, p.status, COALESCE(s.name, 'No supplier') AS supplier
                 FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id ORDER BY p.id DESC LIMIT 5"
            )->fetchAll(),
            'recent_sales'    => $pdo->query(
                "SELECT s.id, s.invoice_no, s.sale_date, s.total_amount, s.status, COALESCE(c.name, 'Walk-in customer') AS customer
                 FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ORDER BY s.id DESC LIMIT 5"
            )->fetchAll(),
            'monthly'         => array_values($months),
        ]);
    }
}
