# Textile Inventory

React (Vite + Tailwind) frontend, Core PHP REST API, MySQL database.

## Modules

| Module | What it does |
|---|---|
| Auth & users | JWT login/logout, change password; Admin manages users and roles |
| Products | Fabric details (type, color, GSM, width, unit, lot/design no., prices), image upload, opening stock |
| Categories, units, brands, counters | Master data CRUD; new products default to the Piece unit |
| Suppliers & customers | Contact details with GSTIN validation |
| Purchases | Purchase orders → receive goods (stock goes up) or cancel |
| Sales | Invoices with GST (stock goes down, overselling blocked), barcode scan entry, discount per line, 80 mm receipt / A4 print, cancel (stock restored), refund or exchange within 7 days of the bill date |
| Stock | Current stock grouped by product, color or lot; full stock ledger; damage / return / correction adjustments; low-stock alerts |
| Dashboard | Stock value, low stock, month totals, 6-month sales vs purchases chart, recent purchases and sales |
| Reports | Stock, purchases, sales, supplier-wise; date filters; CSV export that opens in Excel |

Every stock change goes through one function (`stock_move` in `backend/helpers/stock.php`) inside a transaction, so `products.stock_qty` and `stock_ledger` always agree.

### Roles

| | Admin | Manager | Staff |
|---|:-:|:-:|:-:|
| View products, stock, purchases, sales, parties | ✓ | ✓ | ✓ |
| Create invoices, add/edit customers | ✓ | ✓ | ✓ |
| Products, purchases, adjustments, suppliers, masters, cancel invoices, sales returns | ✓ | ✓ | |
| Reports | ✓ | ✓ | |
| Users | ✓ | | |

## Structure

```
textile-inventory/
├── database/
│   ├── schema.sql           # tables + seed data (fresh install)
│   └── migrations/          # upgrades for an existing database
├── backend/
│   ├── api/                 # index.php router, .htaccess
│   ├── config/              # config.php, database.php (PDO)
│   ├── controllers/         # Auth, User, Product, Master, Party, Purchase, Sale, Stock, Report
│   ├── helpers/             # response.php, jwt.php, stock.php
│   ├── middleware/          # auth.php (JWT + role check)
│   └── uploads/products/    # product images (PHP execution disabled)
└── frontend/src/            # pages, components, context, services, utils
```

## Backup & restore

A Windows scheduled task backs up the database every day at 9 PM to `E:\TextileBackups`. If the PC was off, it runs at the next login. MySQL is started for the backup if it isn't running, then stopped again. The last 30 backups are kept, plus the first of each month for 12 months.

If a backup fails, `DATABASE BACKUP FAILED.txt` appears on the Desktop with the reason. Each run is logged in `E:\TextileBackups\backup.log`.

```
# Set up (or -Uninstall to remove). Add -CopyTo <folder> for a second copy.
powershell -ExecutionPolicy Bypass -File scripts\install-backup-task.ps1

# Back up now
powershell -ExecutionPolicy Bypass -File scripts\backup-database.ps1 -Force

# Check a backup: restores into a separate test database and compares row counts with live
powershell -ExecutionPolicy Bypass -File scripts\restore-database.ps1 -ZipPath E:\TextileBackups\<file>.zip -DropTestDatabase

# Replace the live data: asks you to type RESTORE and backs up the current data first
powershell -ExecutionPolicy Bypass -File scripts\restore-database.ps1 -ZipPath E:\TextileBackups\<file>.zip -Live
```

Product images in `backend/uploads/products` are not included.

## Setup

1. **Database**: start MySQL (XAMPP), then import `database/schema.sql` (phpMyAdmin or `mysql -u root < database/schema.sql`).
   If you already created the database from the older schema, run `database/migrations/001_modules.sql` instead.
2. **Backend**: copy the project into `htdocs/textile-inventory`. Edit `backend/config/config.php` (DB credentials, a long random `jwt_secret`). Make sure Apache `mod_rewrite` is enabled and `AllowOverride All` is set.
3. **Frontend**:
   ```
   cd frontend
   npm install
   npm run dev
   ```
   If your API URL differs, create `frontend/.env` with `VITE_API_URL=http://localhost/textile-inventory/backend/api`.
4. **Company details**: sign in as Admin and open **Company Settings** to set the business name, address, phone, email and GSTIN. They appear in the sidebar, login screen, browser tab and on printed sales bills.
5. Open http://localhost:5173 and sign in with `admin@textile.local` / `Admin@123`. Change this password after first login (header → Change password).

## Deploy to another PC (XAMPP, no Node needed there)

1. On the dev machine: `cd frontend && npm run build` → output in `frontend/dist/`.
2. On the server PC, create `C:\xampp\htdocs\textile-inventory\` and copy in:
   - the **contents** of `frontend/dist/` (`index.html`, `assets/`, `.htaccess`)
   - `backend/` (with `uploads/`)
   - `database/` (for the import only)

   Don't copy `frontend/` source or `node_modules`.
3. Start Apache + MySQL, import `database/schema.sql` in phpMyAdmin (or import a dump of your existing data).
4. Edit `backend/config/config.php`: DB credentials and a new long random `jwt_secret`.
5. In `C:\xampp\apache\conf\httpd.conf`, make sure `mod_rewrite` is enabled and `htdocs` has `AllowOverride All`.
6. Give the server PC a fixed IP and allow **Apache HTTP Server** through Windows Firewall (Private networks, TCP 80).
7. Other PCs open `http://<server-ip>/textile-inventory/`.

**Updating:** rebuild and replace `index.html` + `assets/`. Copy `backend/` only if PHP changed — keep the server's `config.php` and `uploads/`. Run any new `database/migrations/*.sql`.

## API

All responses: `{ success, message, data }`. Send `Authorization: Bearer <token>`. List endpoints take `page`, `per_page`, `search`; date filters take `from` / `to` as `YYYY-MM-DD`.

| Method | Endpoint | Access |
|---|---|---|
| POST | /login | public |
| GET | /me, /dashboard | any logged-in user |
| POST | /me/password | any logged-in user |
| GET | /products (`?all=1`, `category_id`, `low=1`), /products/{id} | any |
| POST / PUT / DELETE | /products, /products/{id}; POST/DELETE /products/{id}/image | Admin, Manager |
| GET / POST / PUT / DELETE | /categories, /units | GET any; write Admin, Manager |
| GET / POST / PUT / DELETE | /suppliers, /customers | GET any; customers POST/PUT any; rest Admin, Manager |
| GET | /purchases, /purchases/{id} | any |
| POST | /purchases (`receive: true` to receive at once), /purchases/{id}/receive, /purchases/{id}/cancel | Admin, Manager |
| GET / POST | /sales, /sales/{id} | any |
| POST | /sales/{id}/cancel | Admin, Manager |
| GET | /stock/summary?group=product\|color\|lot, /stock/ledger, /stock/alerts | any |
| POST | /stock/adjust | Admin, Manager |
| GET | /reports/stock, /reports/purchases, /reports/sales, /reports/supplier-wise | Admin, Manager |
| GET / POST / PUT | /users, /roles | Admin |
