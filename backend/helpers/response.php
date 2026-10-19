<?php
function json_response($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function ok($data = null, string $message = 'OK', int $status = 200): void
{
    json_response(['success' => true, 'message' => $message, 'data' => $data], $status);
}

function fail(string $message, int $status = 400, $errors = null): void
{
    json_response(['success' => false, 'message' => $message, 'errors' => $errors], $status);
}

function input(): array
{
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    return is_array($json) ? $json : [];
}

// Pagination helper: returns [page, perPage, offset]
function paging(): array
{
    $page = max(1, (int)($_GET['page'] ?? 1));
    $per  = min(100, max(1, (int)($_GET['per_page'] ?? 10)));
    return [$page, $per, ($page - 1) * $per];
}
