-- Allow invoices without a customer (walk-in / counter sales): customer_id NULL.
USE textile_inventory;

ALTER TABLE sales MODIFY customer_id INT UNSIGNED NULL;
