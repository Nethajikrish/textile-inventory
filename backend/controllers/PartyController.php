<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

// Suppliers and customers share the same shape, so one controller serves both tables.
class PartyController
{
    private const GSTIN = '/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/';

    public static function index(string $table): void
    {
        // ?all=1 returns a light list for dropdowns
        if (!empty($_GET['all'])) {
            ok(db()->query("SELECT id, name, phone, gstin FROM $table ORDER BY name")->fetchAll());
        }

        [$page, $per, $offset] = paging();
        $search = trim($_GET['search'] ?? '');
        $where = '1 = 1';
        $params = [];
        if ($search !== '') {
            $where = '(name LIKE ? OR phone LIKE ? OR email LIKE ? OR gstin LIKE ?)';
            $params = array_fill(0, 4, "%$search%");
        }

        $count = db()->prepare("SELECT COUNT(*) FROM $table WHERE $where");
        $count->execute($params);
        $stmt = db()->prepare("SELECT * FROM $table WHERE $where ORDER BY name LIMIT $per OFFSET $offset");
        $stmt->execute($params);

        ok(['items' => $stmt->fetchAll(), 'total' => (int)$count->fetchColumn(), 'page' => $page, 'per_page' => $per]);
    }

    public static function show(string $table, int $id): void
    {
        $stmt = db()->prepare("SELECT * FROM $table WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $row ? ok($row) : fail('Not found', 404);
    }

    public static function store(string $table): void
    {
        $d = self::validated(input());
        db()->prepare("INSERT INTO $table (name, phone, email, gstin, address) VALUES (:name, :phone, :email, :gstin, :address)")
            ->execute($d);
        ok(['id' => (int)db()->lastInsertId()], 'Created', 201);
    }

    public static function update(string $table, int $id): void
    {
        $d = self::validated(input());
        $d['id'] = $id;
        db()->prepare("UPDATE $table SET name=:name, phone=:phone, email=:email, gstin=:gstin, address=:address WHERE id=:id")
            ->execute($d);
        ok(null, 'Updated');
    }

    public static function destroy(string $table, int $id): void
    {
        try {
            db()->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('Has purchases or sales on record and cannot be deleted', 409);
            throw $e;
        }
        ok(null, 'Deleted');
    }

    private static function validated(array $in): array
    {
        $d = [];
        foreach (['name', 'phone', 'email', 'gstin', 'address'] as $f) {
            $v = trim((string)($in[$f] ?? ''));
            $d[$f] = $v === '' ? null : $v;
        }
        if ($d['gstin']) $d['gstin'] = strtoupper($d['gstin']);

        $errors = [];
        if (!$d['name']) $errors['name'] = 'Name is required';
        if ($d['email'] && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Invalid email';
        if ($d['gstin'] && !preg_match(self::GSTIN, $d['gstin'])) $errors['gstin'] = 'Invalid GSTIN (15 characters, e.g. 33ABCDE1234F1Z5)';
        if ($d['phone'] && !preg_match('/^[0-9+\-\s]{6,20}$/', $d['phone'])) $errors['phone'] = 'Invalid phone number';
        if ($errors) fail(implode('. ', $errors), 422, $errors);
        return $d;
    }
}
