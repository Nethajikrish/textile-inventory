<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/jwt.php';
require_once __DIR__ . '/../helpers/response.php';

class AuthController
{
    public static function login(): void
    {
        $d = input();
        $email = trim($d['email'] ?? '');
        $password = $d['password'] ?? '';
        if ($email === '' || $password === '') fail('Email and password are required', 422);

        $stmt = db()->prepare(
            'SELECT u.id, u.name, u.email, u.password_hash, r.name AS role
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.email = ? AND u.is_active = 1'
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            fail('Invalid credentials', 401);
        }

        $token = jwt_encode(['id' => (int)$user['id'], 'name' => $user['name'], 'role' => $user['role']]);
        ok([
            'token' => $token,
            'user'  => ['id' => (int)$user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']],
        ], 'Login successful');
    }

    public static function me(array $user): void
    {
        ok($user);
    }

    public static function changePassword(array $user): void
    {
        $d = input();
        $current = (string)($d['current_password'] ?? '');
        $new = (string)($d['new_password'] ?? '');
        if (strlen($new) < 8) fail('New password must be at least 8 characters', 422);

        $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        $hash = $stmt->fetchColumn();
        if (!$hash || !password_verify($current, $hash)) fail('Current password is incorrect', 422);

        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
        ok(null, 'Password changed');
    }
}
