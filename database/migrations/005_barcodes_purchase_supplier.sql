-- Product barcodes/stickers (brand, size, barcode) and purchases without a supplier.
USE textile_inventory;

ALTER TABLE products
  ADD COLUMN barcode VARCHAR(50) NULL UNIQUE AFTER sku,
  ADD COLUMN brand VARCHAR(80) NULL AFTER name,
  ADD COLUMN size VARCHAR(20) NULL AFTER color;

-- Give existing products a barcode: prefix + id, e.g. J0001
UPDATE products SET barcode = CONCAT('J', LPAD(id, 4, '0')) WHERE barcode IS NULL;

-- Prefix used for auto-generated barcodes (Company Settings).
INSERT IGNORE INTO settings (skey, svalue) VALUES ('barcode_prefix', 'J');

-- NULL supplier = direct / unregistered purchase.
ALTER TABLE purchases MODIFY supplier_id INT UNSIGNED NULL;
