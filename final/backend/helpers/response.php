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

// Client error raised deep inside a transaction; the router's exception handler turns it into fail().
class HttpError extends RuntimeException
{
    public function __construct(string $message, int $status = 422)
    {
        parent::__construct($message, $status);
    }
}

function valid_date($s): bool
{
    if (!is_string($s)) return false;
    $d = DateTime::createFromFormat('Y-m-d', $s);
    return $d && $d->format('Y-m-d') === $s;
}

// Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD filter: returns [from|null, to|null]
function date_range(): array
{
    $from = $_GET['from'] ?? '';
    $to = $_GET['to'] ?? '';
    return [valid_date($from) ? $from : null, valid_date($to) ? $to : null];
}
