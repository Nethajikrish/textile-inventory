-- Invoice offer/discount: a percentage or a flat amount, deducted from the subtotal before GST.
USE textile_inventory;

ALTER TABLE sales
  ADD COLUMN discount_type ENUM('percent','amount') NOT NULL DEFAULT 'percent' AFTER subtotal,
  ADD COLUMN discount_value DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER discount_type,
  ADD COLUMN discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER discount_value;
