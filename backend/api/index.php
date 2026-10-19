<?php
// Single entry point / router for the REST API.
$cfg = require __DIR__ . '/../config/config.php';

header('Access-Control-Allow-Origin: ' . $cfg['cors_origin']);
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../middleware/auth.php';
foreach (['Auth', 'Product', 'Master', 'Party', 'Purchase', 'Sale', 'Stock', 'Report', 'User', 'Settings'] as $c) {
    require_once __DIR__ . "/../controllers/{$c}Controller.php";
}

set_exception_handler(function (Throwable $e) {
    if ($e instanceof HttpError) fail($e->getMessage(), $e->getCode() ?: 422);
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
// Sub-action: /purchases/5/receive -> "receive", /stock/ledger -> "ledger"
$action = $id ? ($seg[2] ?? '') : ($seg[1] ?? '');

// Public routes (company name/address is shown on the login screen too)
if ($resource === 'login' && $method === 'POST') AuthController::login();
if ($resource === 'settings' && $method === 'GET') SettingsController::show();

// Everything below needs a valid token
$user = require_auth();
$canWrite = ['Admin', 'Manager'];
$allow = function (array $roles) use ($user) {
    if (!in_array($user['role'], $roles, true)) fail('Forbidden', 403);
};

switch ($resource) {
    case 'me':
        if ($action === 'password' && $method === 'POST') AuthController::changePassword($user);
        AuthController::me($user);
        break;
    case 'dashboard':
        MasterController::dashboard();
        break;

    case 'categories':
    case 'units':
        if ($method === 'GET') MasterController::index($resource);
        $allow($canWrite);
        if ($method === 'POST' && !$id)  MasterController::store($resource);
        if ($method === 'PUT' && $id)    MasterController::update($resource, $id);
        if ($method === 'DELETE' && $id) MasterController::destroy($resource, $id);
        fail('Method not allowed', 405);
        break;

    case 'suppliers':
    case 'customers':
        if ($method === 'GET') { $id ? PartyController::show($resource, $id) : PartyController::index($resource); }
        // Staff may add/edit customers while invoicing; everything else needs Admin/Manager.
        $allow($resource === 'customers' && $method !== 'DELETE' ? ['Admin', 'Manager', 'Staff'] : $canWrite);
        if ($method === 'POST' && !$id)  PartyController::store($resource);
        if ($method === 'PUT' && $id)    PartyController::update($resource, $id);
        if ($method === 'DELETE' && $id) PartyController::destroy($resource, $id);
        fail('Method not allowed', 405);
        break;

    case 'products':
        if ($method === 'GET')  { $id ? ProductController::show($id) : ProductController::index(); }
        $allow($canWrite);
        if ($id && $action === 'image') {
            if ($method === 'POST')   ProductController::uploadImage($id);
            if ($method === 'DELETE') ProductController::deleteImage($id);
        }
        if ($method === 'POST' && !$id)  ProductController::store($user);
        if ($method === 'PUT' && $id)    ProductController::update($id);
        if ($method === 'DELETE' && $id) ProductController::destroy($id);
        fail('Method not allowed', 405);
        break;

    case 'purchases':
        if ($method === 'GET') { $id ? PurchaseController::show($id) : PurchaseController::index(); }
        $allow($canWrite);
        if ($method === 'POST' && !$id)                        PurchaseController::store($user);
        if ($method === 'POST' && $id && $action === 'receive') PurchaseController::receive($id, $user);
        if ($method === 'POST' && $id && $action === 'cancel')  PurchaseController::cancel($id);
        fail('Method not allowed', 405);
        break;

    case 'sales':
        if ($method === 'GET') { $id ? SaleController::show($id) : SaleController::index(); }
        if ($method === 'POST' && !$id) SaleController::store($user); // any role can invoice
        $allow($canWrite);
        if ($method === 'POST' && $id && $action === 'cancel') SaleController::cancel($id, $user);
        fail('Method not allowed', 405);
        break;

    case 'stock':
        if ($method === 'GET' && $action === 'summary') StockController::summary();
        if ($method === 'GET' && $action === 'ledger')  StockController::ledger();
        if ($method === 'GET' && $action === 'alerts')  StockController::alerts();
        $allow($canWrite);
        if ($method === 'POST' && $action === 'adjust') StockController::adjust($user);
        fail('Route not found', 404);
        break;

    case 'reports':
        $allow($canWrite);
        if ($method !== 'GET') fail('Method not allowed', 405);
        if ($action === 'stock')         ReportController::stock();
        if ($action === 'purchases')     ReportController::purchases();
        if ($action === 'sales')         ReportController::sales();
        if ($action === 'supplier-wise') ReportController::supplierWise();
        fail('Route not found', 404);
        break;

    case 'roles':
        $allow(['Admin']);
        UserController::roles();
        break;
    case 'users':
        $allow(['Admin']);
        if ($method === 'GET' && !$id)  UserController::index();
        if ($method === 'POST' && !$id) UserController::store();
        if ($method === 'PUT' && $id)   UserController::update($id, $user);
        fail('Method not allowed', 405);
        break;

    case 'settings':
        $allow(['Admin']);
        if ($method === 'PUT') SettingsController::update();
        fail('Method not allowed', 405);
        break;

    default:
        fail('Route not found', 404);
}
