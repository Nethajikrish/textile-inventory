-- Discount per bill line, 7-day returns (refund or exchange) and a Brand master.
USE textile_inventory;

-- Brands (Masters page). products.brand keeps the name; existing names seed the list.
CREATE TABLE IF NOT EXISTS brands (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;
INSERT IGNORE INTO brands (name)
  SELECT DISTINCT TRIM(brand) FROM products WHERE brand IS NOT NULL AND TRIM(brand) <> '';
UPDATE products p JOIN brands b ON b.name = TRIM(p.brand) SET p.brand = b.name;

-- Piece is the default unit for new products.
INSERT IGNORE INTO units (name, short_name) VALUES ('Piece', 'pc');

-- Sale lines: amount is now after the line's own discount.
ALTER TABLE sale_items
  ADD COLUMN discount_type ENUM('percent','amount') NOT NULL DEFAULT 'percent' AFTER rate,
  ADD COLUMN discount_value DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_type,
  ADD COLUMN discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER discount_value;

-- Credit from an exchange return used on this bill; the customer pays total_amount - exchange_credit.
ALTER TABLE sales
  ADD COLUMN exchange_credit DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER total_amount;

CREATE TABLE IF NOT EXISTS sale_returns (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  return_no VARCHAR(30) NOT NULL UNIQUE,
  sale_id INT UNSIGNED NOT NULL,
  return_date DATE NOT NULL,
  type ENUM('refund','exchange') NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  exchange_sale_id INT UNSIGNED NULL,  -- the new bill an exchange credit was used on
  notes TEXT,
  created_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (exchange_sale_id) REFERENCES sales(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_return_date (return_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_return_items (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  return_id INT UNSIGNED NOT NULL,
  sale_item_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty DECIMAL(14,3) NOT NULL,
  taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;
