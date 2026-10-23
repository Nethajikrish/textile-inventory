-- GST per product (prices include GST), product MRP + discount, bill counters,
-- bill time, CGST/SGST split and round-off on sales.
USE textile_inventory;

-- Products: MRP - discount = selling price (GST inclusive); GST rate per product; model for stickers.
ALTER TABLE products
  ADD COLUMN model VARCHAR(80) NULL AFTER brand,
  ADD COLUMN mrp DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER purchase_price,
  ADD COLUMN discount_type ENUM('percent','amount') NOT NULL DEFAULT 'percent' AFTER mrp,
  ADD COLUMN discount_value DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_type,
  ADD COLUMN gst_percent DECIMAL(5,2) NOT NULL DEFAULT 5 AFTER selling_price;
UPDATE products SET mrp = selling_price WHERE mrp = 0;

-- Billing counters (Masters page).
CREATE TABLE IF NOT EXISTS counters (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;
INSERT IGNORE INTO counters (name) VALUES ('Counter 1');

-- Sales: time, counter, GST split, round-off. gst_inclusive = 0 marks bills made before this change
-- (GST was added on top of the subtotal then).
ALTER TABLE sales
  ADD COLUMN sale_time TIME NULL AFTER sale_date,
  ADD COLUMN counter_id INT UNSIGNED NULL AFTER customer_id,
  ADD COLUMN gst_inclusive TINYINT(1) NOT NULL DEFAULT 1 AFTER discount_amount,
  ADD COLUMN taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER gst_inclusive,
  ADD COLUMN cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER tax_amount,
  ADD COLUMN sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER cgst_amount,
  ADD COLUMN round_off DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER sgst_amount,
  ADD CONSTRAINT fk_sales_counter FOREIGN KEY (counter_id) REFERENCES counters(id);

UPDATE sales SET gst_inclusive = 0, sale_time = TIME(created_at), taxable_amount = subtotal - discount_amount,
  cgst_amount = ROUND(tax_amount / 2, 2), sgst_amount = tax_amount - ROUND(tax_amount / 2, 2);

-- Sale lines: MRP at the time of sale and the GST backed out of the line.
ALTER TABLE sale_items
  ADD COLUMN mrp DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER qty,
  ADD COLUMN gst_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER amount,
  ADD COLUMN taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER gst_percent,
  ADD COLUMN gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER taxable_amount;

UPDATE sale_items i JOIN sales s ON s.id = i.sale_id
SET i.mrp = i.rate, i.gst_percent = s.tax_percent, i.taxable_amount = i.amount,
    i.gst_amount = ROUND(i.amount * s.tax_percent / 100, 2);
