<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/stock.php';

class ProductController
{
    private const SORTABLE = ['name', 'sku', 'stock_qty', 'selling_price', 'created_at'];

    private const IMAGE_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    private const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

    public static function index(): void
    {
        // ?all=1 returns a light list for purchase/sale item pickers
        if (!empty($_GET['all'])) {
            ok(db()->query(
                'SELECT p.id, p.sku, p.barcode, p.name, p.brand, p.color, p.size, p.fabric_type, p.lot_no, p.stock_qty,
                        p.purchase_price, p.selling_price, u.short_name AS unit
                 FROM products p JOIN units u ON u.id = p.unit_id WHERE p.is_active = 1 ORDER BY p.name'
            )->fetchAll());
        }

        [$page, $per, $offset] = paging();
        $search = trim($_GET['search'] ?? '');
        $sort = in_array($_GET['sort'] ?? '', self::SORTABLE, true) ? $_GET['sort'] : 'created_at';
        $dir = strtoupper($_GET['dir'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';

        $where = 'p.is_active = 1';
        $params = [];
        if ($search !== '') {
            $where .= ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.brand LIKE ? OR p.color LIKE ? OR p.lot_no LIKE ?)';
            $params = array_fill(0, 6, "%$search%");
        }
        if (!empty($_GET['category_id'])) {
            $where .= ' AND p.category_id = ?';
            $params[] = (int)$_GET['category_id'];
        }
        if (!empty($_GET['low'])) $where .= ' AND p.stock_qty <= p.min_stock';

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

    public static function store(array $user): void
    {
        $in = input();
        $d = self::validated($in);
        $opening = round((float)($in['opening_stock'] ?? 0), 3);
        if ($opening < 0) fail('Opening stock cannot be negative', 422);

        $sql = 'INSERT INTO products (sku, barcode, name, brand, category_id, unit_id, fabric_type, color, size, gsm, width_inch,
                  lot_no, purchase_price, selling_price, min_stock)
                VALUES (:sku, :barcode, :name, :brand, :category_id, :unit_id, :fabric_type, :color, :size, :gsm, :width_inch,
                  :lot_no, :purchase_price, :selling_price, :min_stock)';
        try {
            $id = tx(function (PDO $pdo) use ($sql, $d, $opening, $user) {
                $pdo->prepare($sql)->execute($d);
                $id = (int)$pdo->lastInsertId();
                if (!$d['barcode']) self::assignBarcode($id);
                // Opening stock goes through the ledger like any other movement.
                if ($opening > 0) stock_move($id, 'opening', null, $opening, 0, 'Opening stock', $user['id']);
                return $id;
            });
        } catch (PDOException $e) {
            self::duplicate($e);
        }
        ok(['id' => $id], 'Product created', 201);
    }

    public static function update(int $id): void
    {
        $d = self::validated(input());
        $d['id'] = $id;
        $sql = 'UPDATE products SET sku=:sku, barcode=:barcode, name=:name, brand=:brand, category_id=:category_id, unit_id=:unit_id,
                  fabric_type=:fabric_type, color=:color, size=:size, gsm=:gsm, width_inch=:width_inch, lot_no=:lot_no,
                  purchase_price=:purchase_price, selling_price=:selling_price, min_stock=:min_stock
                WHERE id=:id';
        try {
            db()->prepare($sql)->execute($d);
            if (!$d['barcode']) self::assignBarcode($id);
        } catch (PDOException $e) {
            self::duplicate($e);
        }
        ok(null, 'Product updated');
    }

    public static function destroy(int $id): void
    {
        // Soft delete keeps purchase/sale history intact.
        db()->prepare('UPDATE products SET is_active = 0 WHERE id = ?')->execute([$id]);
        ok(null, 'Product deleted');
    }

    // POST multipart/form-data with an "image" file field (JPG, PNG or WebP, max 2 MB).
    public static function uploadImage(int $id): void
    {
        $file = $_FILES['image'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) fail('Choose an image to upload', 422);
        if ($file['size'] > self::IMAGE_MAX_BYTES) fail('Image must be 2 MB or smaller', 422);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $ext = self::IMAGE_TYPES[$mime] ?? null;
        if (!$ext) fail('Only JPG, PNG or WebP images are allowed', 422);

        $old = self::currentImage($id);
        $name = 'uploads/products/' . $id . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], __DIR__ . '/../' . $name)) fail('Could not save the image', 500);

        db()->prepare('UPDATE products SET image = ? WHERE id = ?')->execute([$name, $id]);
        self::deleteFile($old);
        ok(['image' => $name], 'Image uploaded');
    }

    public static function deleteImage(int $id): void
    {
        self::deleteFile(self::currentImage($id));
        db()->prepare('UPDATE products SET image = NULL WHERE id = ?')->execute([$id]);
        ok(null, 'Image removed');
    }

    private static function currentImage(int $id): ?string
    {
        $s = db()->prepare('SELECT image FROM products WHERE id = ? AND is_active = 1');
        $s->execute([$id]);
        $row = $s->fetch();
        if (!$row) fail('Product not found', 404);
        return $row['image'];
    }

    private static function deleteFile(?string $path): void
    {
        // Only ever delete files inside uploads/products.
        if ($path && preg_match('#^uploads/products/[\w.]+$#', $path)) @unlink(__DIR__ . '/../' . $path);
    }

    // Blank barcode -> prefix (Company Settings) + id, e.g. J0884; skips codes already taken.
    private static function assignBarcode(int $id): void
    {
        $s = db()->prepare("SELECT svalue FROM settings WHERE skey = 'barcode_prefix'");
        $s->execute();
        $prefix = (string)($s->fetchColumn() ?: '');
        $taken = db()->prepare('SELECT 1 FROM products WHERE barcode = ? AND id <> ?');
        for ($n = 0; ; $n++) {
            $code = $prefix . str_pad((string)$id, 4, '0', STR_PAD_LEFT) . ($n ? "-$n" : '');
            $taken->execute([$code, $id]);
            if (!$taken->fetchColumn()) break;
        }
        db()->prepare('UPDATE products SET barcode = ? WHERE id = ?')->execute([$code, $id]);
    }

    private static function duplicate(PDOException $e): void
    {
        if ($e->getCode() !== '23000') throw $e;
        fail(str_contains($e->getMessage(), 'barcode') ? 'Barcode already used by another product' : 'SKU already exists', 409);
    }

    private static function validated(array $in): array
    {
        $errors = [];
        foreach (['sku', 'name', 'unit_id'] as $f) {
            if (empty($in[$f])) $errors[$f] = "$f is required";
        }
        $barcode = trim((string)($in['barcode'] ?? ''));
        // Code 128 covers printable ASCII; keep it scanner-friendly.
        if ($barcode !== '' && !preg_match('/^[A-Za-z0-9\-.\/]{1,50}$/', $barcode)) $errors['barcode'] = 'Barcode may use letters, digits, - . / only';
        if ($errors) fail(implode('. ', $errors), 422, $errors);

        $text = fn($k) => ($v = trim((string)($in[$k] ?? ''))) === '' ? null : $v;

        return [
            'sku'            => trim($in['sku']),
            'barcode'        => $barcode === '' ? null : $barcode,
            'name'           => trim($in['name']),
            'brand'          => $text('brand'),
            'category_id'    => !empty($in['category_id']) ? (int)$in['category_id'] : null,
            'unit_id'        => (int)$in['unit_id'],
            'fabric_type'    => $in['fabric_type'] ?? null,
            'color'          => $in['color'] ?? null,
            'size'           => $text('size'),
            'gsm'            => isset($in['gsm']) && $in['gsm'] !== '' ? (int)$in['gsm'] : null,
            'width_inch'     => isset($in['width_inch']) && $in['width_inch'] !== '' ? (float)$in['width_inch'] : null,
            'lot_no'         => $in['lot_no'] ?? null,
            'purchase_price' => (float)($in['purchase_price'] ?? 0),
            'selling_price'  => (float)($in['selling_price'] ?? 0),
            'min_stock'      => (float)($in['min_stock'] ?? 0),
        ];
    }
}
