-- Upgrade a database created from the original schema.sql to the full module set.
USE textile_inventory;

ALTER TABLE purchases
  ADD COLUMN status ENUM('ordered','received','cancelled') NOT NULL DEFAULT 'ordered' AFTER total_amount,
  ADD COLUMN received_at DATETIME NULL AFTER status;
-- Purchases created before this migration already moved stock, so treat them as received.
UPDATE purchases SET status = 'received', received_at = created_at;

ALTER TABLE sales
  ADD COLUMN status ENUM('completed','cancelled') NOT NULL DEFAULT 'completed' AFTER total_amount;

ALTER TABLE stock_ledger
  MODIFY txn_type ENUM('opening','purchase','sale','adjustment','return','damage') NOT NULL;

-- Give products that have stock but no ledger history an opening entry.
INSERT INTO stock_ledger (product_id, txn_type, qty_in, balance, remarks)
SELECT p.id, 'opening', p.stock_qty, p.stock_qty, 'Opening stock'
FROM products p
WHERE p.stock_qty > 0 AND NOT EXISTS (SELECT 1 FROM stock_ledger l WHERE l.product_id = p.id);
