# Textile Inventory

React (Vite + Tailwind) frontend, Core PHP REST API, MySQL database.

## Modules

| Module | What it does |
|---|---|
| Auth & users | JWT login/logout, change password; Admin manages users and roles |
| Products | Fabric details (type, color, GSM, width, unit, lot/design no., prices), image upload, opening stock |
| Categories & units | Master data CRUD |
| Suppliers & customers | Contact details with GSTIN validation |
| Purchases | Purchase orders → receive goods (stock goes up) or cancel |
| Sales | Invoices with GST (stock goes down, overselling blocked), print / save as PDF, cancel (stock restored) |
| Stock | Current stock grouped by product, color or lot; full stock ledger; damage / return / correction adjustments; low-stock alerts |
| Dashboard | Stock value, low stock, month totals, 6-month sales vs purchases chart, recent purchases and sales |
| Reports | Stock, purchases, sales, supplier-wise; date filters; CSV export that opens in Excel |

Every stock change goes through one function (`stock_move` in `backend/helpers/stock.php`) inside a transaction, so `products.stock_qty` and `stock_ledger` always agree.

### Roles

| | Admin | Manager | Staff |
|---|:-:|:-:|:-:|
| View products, stock, purchases, sales, parties | ✓ | ✓ | ✓ |
| Create invoices, add/edit customers | ✓ | ✓ | ✓ |
| Products, purchases, adjustments, suppliers, masters, cancel invoices | ✓ | ✓ | |
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
