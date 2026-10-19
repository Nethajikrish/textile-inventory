<?php
// Single entry point / router for the REST API.
$cfg = require __DIR__ . '/../config/config.php';

header('Access-Control-Allow-Origin: ' . $cfg['cors_origin']);
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../controllers/AuthController.php';
require_once __DIR__ . '/../controllers/ProductController.php';
require_once __DIR__ . '/../controllers/MasterController.php';

set_exception_handler(function (Throwable $e) {
    error_log($e);
    fail('Server error', 500);
});

$method = $_SERVER['REQUEST_METHOD'];
$path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
// Strip everything up to and including "api/" so it works under any folder.
$path = preg_replace('#^.*?api/?#', '', $path);
$seg = $path === '' ? [] : explode('/', $path);
$resource = $seg[0] ?? '';
$id = isset($seg[1]) && ctype_digit($seg[1]) ? (int)$seg[1] : null;

// Public route
if ($resource === 'login' && $method === 'POST') AuthController::login();

// Everything below needs a valid token
$user = require_auth();
$canWrite = ['Admin', 'Manager'];

switch ($resource) {
    case 'me':
        AuthController::me($user);
        break;
    case 'dashboard':
        MasterController::dashboard();
        break;
    case 'categories':
        MasterController::categories();
        break;
    case 'units':
        MasterController::units();
        break;
    case 'products':
        if ($method === 'GET')  { $id ? ProductController::show($id) : ProductController::index(); }
        require_auth($canWrite);
        if ($method === 'POST' && !$id) ProductController::store();
        if ($method === 'PUT' && $id)   ProductController::update($id);
        if ($method === 'DELETE' && $id) ProductController::destroy($id);
        fail('Method not allowed', 405);
        break;
    default:
        fail('Route not found', 404);
}
