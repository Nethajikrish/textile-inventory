<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/response.php';

// Runs $fn inside a transaction; rolls back on any exception and rethrows it.
function tx(callable $fn)
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $fn($pdo);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

// The only place stock_qty changes: locks the product row, updates it and writes a ledger entry.
// Must be called inside tx(). Returns the new balance.
function stock_move(int $productId, string $type, ?int $refId, float $in, float $out, ?string $remarks, ?int $userId): float
{
    $pdo = db();
    $s = $pdo->prepare('SELECT name, stock_qty FROM products WHERE id = ? FOR UPDATE');
    $s->execute([$productId]);
    $p = $s->fetch();
    if (!$p) throw new HttpError("Product #$productId not found");

    $balance = round((float)$p['stock_qty'] + $in - $out, 3);
    if ($balance < 0) {
        throw new HttpError("Insufficient stock for {$p['name']} (available: " . (float)$p['stock_qty'] . ')');
    }

    $pdo->prepare('UPDATE products SET stock_qty = ? WHERE id = ?')->execute([$balance, $productId]);
    $pdo->prepare(
        'INSERT INTO stock_ledger (product_id, txn_type, ref_id, qty_in, qty_out, balance, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$productId, $type, $refId, $in, $out, $balance, $remarks, $userId]);
    return $balance;
}

// Next document number like PO-2026-0001 / INV-2026-0001 (sequence restarts each year).
function next_doc_no(string $table, string $column, string $prefix): string
{
    $base = $prefix . '-' . date('Y') . '-';
    $s = db()->prepare("SELECT MAX($column) FROM $table WHERE $column LIKE ?");
    $s->execute([$base . '%']);
    $last = $s->fetchColumn();
    $n = $last ? (int)substr($last, strlen($base)) + 1 : 1;
    return $base . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
}

// Validates purchase/sale line items: [{product_id, qty, rate}] -> rows with amount.
function validated_items($items): array
{
    if (!is_array($items) || !$items) throw new HttpError('Add at least one item');
    $rows = [];
    foreach ($items as $i => $it) {
        $line = $i + 1;
        $pid = (int)($it['product_id'] ?? 0);
        $qty = round((float)($it['qty'] ?? 0), 3);
        $rate = round((float)($it['rate'] ?? 0), 2);
        if ($pid <= 0) throw new HttpError("Line $line: select a product");
        if ($qty <= 0) throw new HttpError("Line $line: quantity must be greater than 0");
        if ($rate < 0) throw new HttpError("Line $line: rate cannot be negative");
        $rows[] = ['product_id' => $pid, 'qty' => $qty, 'rate' => $rate, 'amount' => round($qty * $rate, 2)];
    }
    return $rows;
}
