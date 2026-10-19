# Textile Inventory

React (Vite + Tailwind) frontend, Core PHP REST API, MySQL database.

## Structure

```
textile-inventory/
├── database/schema.sql      # tables + seed data
├── backend/
│   ├── api/                 # index.php router, .htaccess
│   ├── config/              # config.php, database.php (PDO)
│   ├── controllers/         # Auth, Product, Master (dropdowns + dashboard)
│   ├── helpers/             # response.php, jwt.php
│   └── middleware/          # auth.php (JWT + role check)
└── frontend/src/            # pages, components, context, services
```

## Setup

1. **Database**: start MySQL (XAMPP), then import `database/schema.sql` (phpMyAdmin or `mysql -u root < database/schema.sql`).
2. **Backend**: copy the project into `htdocs/textile-inventory`. Edit `backend/config/config.php` (DB credentials, a long random `jwt_secret`). Make sure Apache `mod_rewrite` is enabled and `AllowOverride All` is set.
3. **Frontend**:
   ```
   cd frontend
   npm install
   npm run dev
   ```
   If your API URL differs, create `frontend/.env` with `VITE_API_URL=http://localhost/textile-inventory/backend/api`.
4. Open http://localhost:5173 and sign in with `admin@textile.local` / `Admin@123`. Change this password after first login.

## API (so far)

| Method | Endpoint | Access |
|---|---|---|
| POST | /login | public |
| GET | /me, /dashboard, /categories, /units | any logged-in user |
| GET | /products?page=&per_page=&search=&sort=&dir= | any logged-in user |
| POST / PUT / DELETE | /products, /products/{id} | Admin, Manager |

All responses: `{ success, message, data }`. Send `Authorization: Bearer <token>`.

## Next modules

Suppliers, customers, purchases, sales and invoices, stock ledger and adjustments, reports with CSV export, and user management. The `purchases`, `sales` and `stock_ledger` tables already exist in the schema; the PHP controllers and React pages for them are the next step.
