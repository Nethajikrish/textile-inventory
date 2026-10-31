-- Quotations: from a supplier (before a purchase order) or to a customer (before a sales bill).
-- Quotations never change stock; only the purchase or bill made from them does.
USE textile_inventory;

CREATE TABLE IF NOT EXISTS quotations (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  quote_no VARCHAR(30) NOT NULL UNIQUE,
  type ENUM('supplier','customer') NOT NULL,
  supplier_id INT UNSIGNED NULL,
  customer_id INT UNSIGNED NULL,  -- NULL on a customer quotation = walk-in customer
  quote_date DATE NOT NULL,
  valid_until DATE NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_type ENUM('percent','amount') NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  round_off DECIMAL(6,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('open','converted','cancelled') NOT NULL DEFAULT 'open',
  converted_id INT UNSIGNED NULL,  -- the purchase (supplier) or sale (customer) made from it
  notes TEXT,
  created_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_quote_list (type, quote_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotation_items (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  quotation_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty DECIMAL(14,3) NOT NULL,
  mrp DECIMAL(12,2) NOT NULL DEFAULT 0,
  rate DECIMAL(12,2) NOT NULL,
  discount_type ENUM('percent','amount') NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL,
  gst_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;
