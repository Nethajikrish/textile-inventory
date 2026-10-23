<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

// User management (Admin only).
class UserController
{
    public static function roles(): void
    {
        ok(db()->query('SELECT id, name FROM roles ORDER BY id')->fetchAll());
    }

    public static function index(): void
    {
        ok(db()->query(
            'SELECT u.id, u.name, u.email, u.role_id, r.name AS role, u.is_active, u.created_at
             FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.name'
        )->fetchAll());
    }

    public static function store(): void
    {
        $d = self::validated(input(), true);
        $d['password_hash'] = password_hash($d['password'], PASSWORD_DEFAULT);
        unset($d['password']);
        self::write('INSERT INTO users (name, email, role_id, is_active, password_hash)
                     VALUES (:name, :email, :role_id, :is_active, :password_hash)', $d);
        ok(['id' => (int)db()->lastInsertId()], 'User created', 201);
    }

    public static function update(int $id, array $me): void
    {
        $d = self::validated(input(), false);
        if ($id === (int)$me['id'] && (!$d['is_active'] || (int)$d['role_id'] !== self::adminRoleId())) {
            fail('You cannot deactivate yourself or remove your own Admin role', 422);
        }

        $sql = 'UPDATE users SET name=:name, email=:email, role_id=:role_id, is_active=:is_active';
        if ($d['password'] !== '') {
            $sql .= ', password_hash=:password_hash';
            $d['password_hash'] = password_hash($d['password'], PASSWORD_DEFAULT);
        }
        unset($d['password']);
        $d['id'] = $id;
        self::write("$sql WHERE id=:id", $d);
        ok(null, 'User updated');
    }

    private static function adminRoleId(): int
    {
        return (int)db()->query("SELECT id FROM roles WHERE name = 'Admin'")->fetchColumn();
    }

    private static function write(string $sql, array $params): void
    {
        try {
            db()->prepare($sql)->execute($params);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('Email already in use, or invalid role', 409);
            throw $e;
        }
    }

    private static function validated(array $in, bool $isNew): array
    {
        $d = [
            'name'      => trim($in['name'] ?? ''),
            'email'     => trim($in['email'] ?? ''),
            'role_id'   => (int)($in['role_id'] ?? 0),
            'is_active' => !isset($in['is_active']) || !empty($in['is_active']) ? 1 : 0,
            'password'  => (string)($in['password'] ?? ''),
        ];
        $errors = [];
        if ($d['name'] === '') $errors['name'] = 'Name is required';
        if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Valid email is required';
        if ($d['role_id'] <= 0) $errors['role_id'] = 'Role is required';
        if (($isNew || $d['password'] !== '') && strlen($d['password']) < 8) {
            $errors['password'] = 'Password must be at least 8 characters';
        }
        if ($errors) fail(implode('. ', $errors), 422, $errors);
        return $d;
    }
}
