-- Company details (name, address, GSTIN...) editable from the app instead of frontend config.
USE textile_inventory;

CREATE TABLE IF NOT EXISTS settings (
  skey VARCHAR(50) PRIMARY KEY,
  svalue TEXT
) ENGINE=InnoDB;

INSERT IGNORE INTO settings (skey, svalue) VALUES
('company_name', 'Textile Inventory'),
('building_no', '1 133'),
('street', 'Chennai to Kumbookonam main road'),
('city', 'Panayapuram'),
('district', 'Viluppuram'),
('state', 'Tamil Nadu'),
('pincode', '605601'),
('phone', ''),
('email', ''),
('gstin', '');
