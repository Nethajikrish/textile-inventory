<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

// Report data as JSON; the frontend renders it and exports CSV.
class ReportController
{
    // GET /reports/stock?category_id=&low=1
    public static function stock(): void
    {
        $where = 'p.is_active = 1';
        $params = [];
        if (!empty($_GET['category_id'])) { $where .= ' AND p.category_id = ?'; $params[] = (int)$_GET['category_id']; }
        if (!empty($_GET['low'])) $where .= ' AND p.stock_qty <= p.min_stock';

        $s = db()->prepare(
            "SELECT p.sku, p.name, c.name AS category, p.fabric_type, p.color, p.lot_no, u.short_name AS unit,
                    p.stock_qty, p.min_stock, p.purchase_price, p.selling_price,
                    ROUND(p.stock_qty * p.purchase_price, 2) AS stock_value
             FROM products p JOIN units u ON u.id = p.unit_id LEFT JOIN categories c ON c.id = p.category_id
             WHERE $where ORDER BY p.name"
        );
        $s->execute($params);
        ok($s->fetchAll());
    }

    // GET /reports/purchases?from=&to=&supplier_id=&status=
    public static function purchases(): void
    {
        [$where, $params] = self::dateWhere('p.purchase_date');
        if (!empty($_GET['supplier_id'])) { $where .= ' AND p.supplier_id = ?'; $params[] = (int)$_GET['supplier_id']; }
        if (in_array($_GET['status'] ?? '', ['ordered', 'received', 'cancelled'], true)) {
            $where .= ' AND p.status = ?';
            $params[] = $_GET['status'];
        } else {
            $where .= " AND p.status <> 'cancelled'";
        }

        $s = db()->prepare(
            "SELECT p.purchase_no, p.purchase_date, COALESCE(s.name, 'No supplier') AS supplier, s.gstin, p.status,
                    (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id = p.id) AS items,
                    p.total_amount
             FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
             WHERE $where ORDER BY p.purchase_date, p.id"
        );
        $s->execute($params);
        ok($s->fetchAll());
    }

    // GET /reports/sales?from=&to=&customer_id=  (completed invoices only)
    public static function sales(): void
    {
        [$where, $params] = self::dateWhere('s.sale_date');
        $where .= " AND s.status = 'completed'";
        if (!empty($_GET['customer_id'])) { $where .= ' AND s.customer_id = ?'; $params[] = (int)$_GET['customer_id']; }

        $s = db()->prepare(
            "SELECT s.invoice_no, s.sale_date, COALESCE(c.name, 'Walk-in customer') AS customer, c.gstin,
                    (SELECT COALESCE(SUM(i.discount_amount), 0) FROM sale_items i WHERE i.sale_id = s.id) AS item_discount,
                    s.subtotal, s.discount_amount, s.taxable_amount AS taxable_value,
                    s.cgst_amount, s.sgst_amount, s.round_off, s.total_amount,
                    (SELECT COALESCE(SUM(r.amount), 0) FROM sale_returns r WHERE r.sale_id = s.id) AS returned_amount
             FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
             WHERE $where ORDER BY s.sale_date, s.id"
        );
        $s->execute($params);
        ok($s->fetchAll());
    }

    // GET /reports/returns?from=&to=&customer_id=  (by return date)
    public static function returns(): void
    {
        [$where, $params] = self::dateWhere('r.return_date');
        if (!empty($_GET['customer_id'])) { $where .= ' AND s.customer_id = ?'; $params[] = (int)$_GET['customer_id']; }

        $s = db()->prepare(
            "SELECT r.return_no, r.return_date, s.invoice_no, COALESCE(c.name, 'Walk-in customer') AS customer, c.gstin, r.type,
                    SUM(ri.qty) AS qty, SUM(ri.taxable_amount) AS taxable_value,
                    ROUND(SUM(ri.gst_amount) / 2, 2) AS cgst_amount,
                    SUM(ri.gst_amount) - ROUND(SUM(ri.gst_amount) / 2, 2) AS sgst_amount,
                    r.amount
             FROM sale_returns r
             JOIN sale_return_items ri ON ri.return_id = r.id
             JOIN sales s ON s.id = r.sale_id
             LEFT JOIN customers c ON c.id = s.customer_id
             WHERE $where
             GROUP BY r.id, r.return_no, r.return_date, s.invoice_no, c.name, c.gstin, r.type, r.amount
             ORDER BY r.return_date, r.id"
        );
        $s->execute($params);
        ok($s->fetchAll());
    }

    // GET /reports/supplier-wise?from=&to=  (received purchases only)
    public static function supplierWise(): void
    {
        [$where, $params] = self::dateWhere('p.purchase_date');
        $s = db()->prepare(
            "SELECT COALESCE(s.name, 'No supplier') AS supplier, s.gstin, COUNT(DISTINCT p.id) AS purchases,
                    SUM(i.qty) AS total_qty, SUM(i.amount) AS total_amount
             FROM purchases p
             LEFT JOIN suppliers s ON s.id = p.supplier_id
             JOIN purchase_items i ON i.purchase_id = p.id
             WHERE $where AND p.status = 'received'
             GROUP BY s.id, s.name, s.gstin ORDER BY total_amount DESC"
        );
        $s->execute($params);
        ok($s->fetchAll());
    }

    private static function dateWhere(string $col): array
    {
        [$from, $to] = date_range();
        $where = '1 = 1';
        $params = [];
        if ($from) { $where .= " AND $col >= ?"; $params[] = $from; }
        if ($to)   { $where .= " AND $col <= ?"; $params[] = $to; }
        return [$where, $params];
    }
}
