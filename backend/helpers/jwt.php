<?php
// Minimal HS256 JWT implementation (no external libraries).
function b64url(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function b64url_decode(string $s): string
{
    return base64_decode(strtr($s, '-_', '+/'));
}

function jwt_encode(array $payload): string
{
    $cfg = require __DIR__ . '/../config/config.php';
    $payload['iat'] = time();
    $payload['exp'] = time() + $cfg['jwt_ttl'];
    $h = b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $p = b64url(json_encode($payload));
    $sig = b64url(hash_hmac('sha256', "$h.$p", $cfg['jwt_secret'], true));
    return "$h.$p.$sig";
}

function jwt_decode(string $token): ?array
{
    $cfg = require __DIR__ . '/../config/config.php';
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$h, $p, $s] = $parts;
    $expected = b64url(hash_hmac('sha256', "$h.$p", $cfg['jwt_secret'], true));
    if (!hash_equals($expected, $s)) return null;
    $payload = json_decode(b64url_decode($p), true);
    if (!is_array($payload) || ($payload['exp'] ?? 0) < time()) return null;
    return $payload;
}
