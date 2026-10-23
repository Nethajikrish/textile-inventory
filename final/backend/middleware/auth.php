<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/jwt.php';
require_once __DIR__ . '/../helpers/response.php';

// Reads the Bearer token, returns the user payload or ends with 401.
function require_auth(array $roles = []): array
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('getallheaders')) {
        $all = array_change_key_case(getallheaders(), CASE_LOWER);
        $header = $all['authorization'] ?? '';
    }
    if (!preg_match('/Bearer\s+(.+)/i', $header, $m)) fail('Unauthorized', 401);
    $user = jwt_decode($m[1]);
    if (!$user) fail('Invalid or expired token', 401);

    // Re-check the account so deactivation and role changes apply immediately, not when the token expires.
    static $current = [];
    if (!isset($current[$user['id']])) {
        $s = db()->prepare('SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.is_active = 1');
        $s->execute([$user['id']]);
        $current[$user['id']] = $s->fetchColumn();
    }
    if (!$current[$user['id']]) fail('Account is disabled', 401);
    $user['role'] = $current[$user['id']];

    if ($roles && !in_array($user['role'], $roles, true)) fail('Forbidden', 403);
    return $user;
}
