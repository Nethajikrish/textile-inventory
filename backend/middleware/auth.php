<?php
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
    if ($roles && !in_array($user['role'], $roles, true)) fail('Forbidden', 403);
    return $user;
}
