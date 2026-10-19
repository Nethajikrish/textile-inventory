<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

class ProductController
{
    private const SORTABLE = ['name', 'sku', 'stock_qty', 'selling_price', 'created_at'];

    public static function index(): void
    {
        [$page, $per, $offset] = paging();
        $search = trim($_GET['search'] ?? '');
        $sort = in_array($_GET['sort'] ?? '', self::SORTABLE, true) ? $_GET['sort'] : 'created_at';
        $dir = strtoupper($_GET['dir'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';

        $where = 'p.is_active = 1';
        $params = [];
        if ($search !== '') {
            $where .= ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.color LIKE ? OR p.lot_no LIKE ?)';
            $like = "%$search%";
            $params = [$like, $like, $like, $like];
        }

        $count = db()->prepare("SELECT COUNT(*) FROM products p WHERE $where");
        $count->execute($params);
        $total = (int)$count->fetchColumn();

        $sql = "SELECT p.*, c.name AS category, u.short_name AS unit
                FROM products p
                LEFT JOIN categories c ON c.id = p.category_id
                JOIN units u ON u.id = p.unit_id
                WHERE $where ORDER BY p.$sort $dir LIMIT $per OFFSET $offset";
        $stmt = db()->prepare($sql);
        $stmt->execute($params);

        ok(['items' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'per_page' => $per]);
    }

    public static function show(int $id): void
    {
        $stmt = db()->prepare('SELECT * FROM products WHERE id = ? AND is_active = 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $row ? ok($row) : fail('Product not found', 404);
    }

    public static function store(): void
    {
        $d = self::validated(input());
        $sql = 'INSERT INTO products (sku, name, category_id, unit_id, fabric_type, color, gsm, width_inch,
                  lot_no, purchase_price, selling_price, min_stock)
                VALUES (:sku, :name, :category_id, :unit_id, :fabric_type, :color, :gsm, :width_inch,
                  :lot_no, :purchase_price, :selling_price, :min_stock)';
        try {
            db()->prepare($sql)->execute($d);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('SKU already exists', 409);
            throw $e;
        }
        ok(['id' => (int)db()->lastInsertId()], 'Product created', 201);
    }

    public static function update(int $id): void
    {
        $d = self::validated(input());
        $d['id'] = $id;
        $sql = 'UPDATE products SET sku=:sku, name=:name, category_id=:category_id, unit_id=:unit_id,
                  fabric_type=:fabric_type, color=:color, gsm=:gsm, width_inch=:width_inch, lot_no=:lot_no,
                  purchase_price=:purchase_price, selling_price=:selling_price, min_stock=:min_stock
                WHERE id=:id';
        try {
            db()->prepare($sql)->execute($d);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('SKU already exists', 409);
            throw $e;
        }
        ok(null, 'Product updated');
    }

    public static function destroy(int $id): void
    {
        // Soft delete keeps purchase/sale history intact.
        db()->prepare('UPDATE products SET is_active = 0 WHERE id = ?')->execute([$id]);
        ok(null, 'Product deleted');
    }

    private static function validated(array $in): array
    {
        $errors = [];
        foreach (['sku', 'name', 'unit_id'] as $f) {
            if (empty($in[$f])) $errors[$f] = "$f is required";
        }
        if ($errors) fail('Validation failed', 422, $errors);

        return [
            'sku'            => trim($in['sku']),
            'name'           => trim($in['name']),
            'category_id'    => !empty($in['category_id']) ? (int)$in['category_id'] : null,
            'unit_id'        => (int)$in['unit_id'],
            'fabric_type'    => $in['fabric_type'] ?? null,
            'color'          => $in['color'] ?? null,
            'gsm'            => isset($in['gsm']) && $in['gsm'] !== '' ? (int)$in['gsm'] : null,
            'width_inch'     => isset($in['width_inch']) && $in['width_inch'] !== '' ? (float)$in['width_inch'] : null,
            'lot_no'         => $in['lot_no'] ?? null,
            'purchase_price' => (float)($in['purchase_price'] ?? 0),
            'selling_price'  => (float)($in['selling_price'] ?? 0),
            'min_stock'      => (float)($in['min_stock'] ?? 0),
        ];
    }
}
