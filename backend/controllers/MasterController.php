<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

// Read-only lists for dropdowns, plus the dashboard summary.
class MasterController
{
    public static function categories(): void
    {
        ok(db()->query('SELECT id, name FROM categories ORDER BY name')->fetchAll());
    }

    public static function units(): void
    {
        ok(db()->query('SELECT id, name, short_name FROM units ORDER BY name')->fetchAll());
    }

    public static function dashboard(): void
    {
        $pdo = db();
        ok([
            'products'    => (int)$pdo->query('SELECT COUNT(*) FROM products WHERE is_active = 1')->fetchColumn(),
            'stock_value' => (float)$pdo->query('SELECT COALESCE(SUM(stock_qty * purchase_price), 0) FROM products WHERE is_active = 1')->fetchColumn(),
            'low_stock'   => $pdo->query(
                'SELECT id, sku, name, stock_qty, min_stock FROM products
                 WHERE is_active = 1 AND stock_qty <= min_stock ORDER BY stock_qty ASC LIMIT 10'
            )->fetchAll(),
        ]);
    }
}
