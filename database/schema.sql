-- Textile Inventory Management: MySQL schema + seed data
CREATE DATABASE IF NOT EXISTS textile_inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE textile_inventory;

CREATE TABLE roles (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id TINYINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE units (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(30) NOT NULL UNIQUE,
  short_name VARCHAR(10) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE brands (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(150),
  gstin VARCHAR(20),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_supplier_name (name)
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(150),
  gstin VARCHAR(20),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_name (name)
) ENGINE=InnoDB;

CREATE TABLE products (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sku VARCHAR(50) NOT NULL UNIQUE,
  barcode VARCHAR(50) NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  brand VARCHAR(80),
  model VARCHAR(80),
  category_id INT UNSIGNED,
  unit_id INT UNSIGNED NOT NULL,
  fabric_type VARCHAR(50),
  color VARCHAR(50),
  size VARCHAR(20),
  gsm INT UNSIGNED,
  width_inch DECIMAL(6,2),
  lot_no VARCHAR(50),
  purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  mrp DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_type ENUM('percent','amount') NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,  -- MRP - discount, GST inclusive
  gst_percent DECIMAL(5,2) NOT NULL DEFAULT 5,
  stock_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  min_stock DECIMAL(14,3) NOT NULL DEFAULT 0,
  image VARCHAR(255),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id),
  INDEX idx_product_name (name),
  INDEX idx_product_color (color),
  INDEX idx_product_lot (lot_no)
) ENGINE=InnoDB;

CREATE TABLE purchases (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  purchase_no VARCHAR(30) NOT NULL UNIQUE,
  supplier_id INT UNSIGNED NULL,  -- NULL = no supplier (direct purchase)
  purchase_date DATE NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('ordered','received','cancelled') NOT NULL DEFAULT 'ordered',
  received_at DATETIME NULL,
  notes TEXT,
  created_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_purchase_date (purchase_date)
) ENGINE=InnoDB;

CREATE TABLE purchase_items (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  purchase_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty DECIMAL(14,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE counters (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE sales (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  invoice_no VARCHAR(30) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NULL,  -- NULL = walk-in customer
  counter_id INT UNSIGNED NULL,
  sale_date DATE NOT NULL,
  sale_time TIME NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_type ENUM('percent','amount') NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_inclusive TINYINT(1) NOT NULL DEFAULT 1,  -- 0 = older bill with GST added on top
  taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,  -- CGST + SGST
  cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  round_off DECIMAL(6,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  exchange_credit DECIMAL(14,2) NOT NULL DEFAULT 0,  -- customer pays total_amount - exchange_credit
  status ENUM('completed','cancelled') NOT NULL DEFAULT 'completed',
  notes TEXT,
  created_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (counter_id) REFERENCES counters(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sale_date (sale_date)
) ENGINE=InnoDB;

CREATE TABLE sale_items (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sale_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty DECIMAL(14,3) NOT NULL,
  mrp DECIMAL(12,2) NOT NULL DEFAULT 0,
  rate DECIMAL(12,2) NOT NULL,  -- price incl. GST, before the line discount
  discount_type ENUM('percent','amount') NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL,  -- qty x rate - discount_amount
  gst_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE sale_returns (
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

CREATE TABLE sale_return_items (
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

CREATE TABLE stock_ledger (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  txn_type ENUM('opening','purchase','sale','adjustment','return','damage') NOT NULL,
  ref_id INT UNSIGNED,
  qty_in DECIMAL(14,3) NOT NULL DEFAULT 0,
  qty_out DECIMAL(14,3) NOT NULL DEFAULT 0,
  balance DECIMAL(14,3) NOT NULL,
  remarks VARCHAR(255),
  created_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_ledger_product (product_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE settings (
  skey VARCHAR(50) PRIMARY KEY,
  svalue TEXT
) ENGINE=InnoDB;

-- Seed data
INSERT INTO settings (skey, svalue) VALUES
('company_name', 'Textile Inventory'), ('building_no', '1 133'), ('street', 'Chennai to Kumbookonam main road'),
('city', 'Panayapuram'), ('district', 'Viluppuram'), ('state', 'Tamil Nadu'), ('pincode', '605601'),
('phone', ''), ('email', ''), ('gstin', ''), ('barcode_prefix', 'J');
INSERT INTO roles (name) VALUES ('Admin'), ('Manager'), ('Staff');

-- Default login: admin@textile.local / Admin@123  (change after first login)
INSERT INTO users (name, email, password_hash, role_id) VALUES
('Administrator', 'admin@textile.local', '$2y$10$m9zYW3tf56wrJmpJjoo4TuTgYYe/ZaZF4LQs6nr.Rh2Yg6SvY7tlW', 1);

INSERT INTO categories (name) VALUES ('Cotton'), ('Silk'), ('Polyester'), ('Linen'), ('Wool'), ('Blended');
INSERT INTO units (name, short_name) VALUES ('Meter', 'm'), ('Kilogram', 'kg'), ('Roll', 'roll'), ('Piece', 'pc');

INSERT INTO suppliers (name, phone, gstin, address) VALUES
('Surat Weaves Pvt Ltd', '9876543210', '24ABCDE1234F1Z5', 'Surat, Gujarat');
INSERT INTO customers (name, phone, gstin, address) VALUES
('Royal Garments', '9123456780', '33PQRSX5678L1Z2', 'Tiruppur, Tamil Nadu');

INSERT INTO products (sku, name, category_id, unit_id, fabric_type, color, gsm, width_inch, lot_no, purchase_price, selling_price, stock_qty, min_stock) VALUES
('COT-WHT-001', 'Cotton Poplin', 1, 1, 'Cotton', 'White', 120, 58, 'LOT-A1', 85.00, 110.00, 500, 100),
('SLK-RED-001', 'Banarasi Silk', 2, 1, 'Silk', 'Red', 90, 44, 'LOT-B1', 450.00, 620.00, 80, 50),
('POL-BLK-001', 'Polyester Crepe', 3, 1, 'Polyester', 'Black', 110, 60, 'LOT-C1', 60.00, 82.00, 30, 100);

INSERT INTO stock_ledger (product_id, txn_type, qty_in, balance, remarks, created_by)
SELECT id, 'opening', stock_qty, stock_qty, 'Opening stock', 1 FROM products;

-- Barcodes for the seed products: prefix + id, e.g. J0001
UPDATE products SET barcode = CONCAT('J', LPAD(id, 4, '0')) WHERE barcode IS NULL;

INSERT INTO counters (name) VALUES ('Counter 1');
UPDATE products SET mrp = selling_price;
