# Restaurant Billing & POS

A full-stack restaurant point-of-sale: **React + TypeScript + Tailwind** frontend, **Django REST Framework + MySQL** backend, JWT login, roles (Admin / Manager / Cashier), billing with GST, split payments, kitchen display, inventory, reports and printable receipts.

> **Tested here:** 54 backend tests (SQLite) and 10 frontend tests pass, the TypeScript build is clean, and a live run of login → calculate → order → payment → idempotent replay → dashboard worked.
> **Not tested here:** MySQL/MariaDB itself, real browsers, and real printers. The first run on your PC is the real MySQL test. Row-locking (`select_for_update`) is a no-op on SQLite, so concurrency behaviour is only exercised on MySQL/InnoDB.

---

## 1. Quick start (Windows 10/11, PowerShell)

You need: **Python 3.10 to 3.12**, **Node.js 18+**, and **XAMPP** (MariaDB 10.4+) or MySQL 8.

### 1.1 Create the database (XAMPP)
1. Open the XAMPP Control Panel and **Start** MySQL.
2. Click **Shell** in XAMPP (or use phpMyAdmin at http://localhost/phpmyadmin) and run:
   ```
   mysql -u root -e "CREATE DATABASE restaurant_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```
   (phpMyAdmin: *New* → name `restaurant_pos` → collation `utf8mb4_unicode_ci`.)

### 1.2 Backend — **Terminal 1** (PowerShell)
```powershell
cd restaurant-pos\backend
python -m venv venv
.\venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt
Copy-Item .env.example .env          # then edit .env: set DJANGO_SECRET_KEY and DB_PASSWORD
python manage.py migrate
python manage.py createsuperuser     # this account becomes an Admin
python manage.py seed_demo_data      # sample menu, tables, ingredients + demo users (optional)
python manage.py runserver           # http://127.0.0.1:8000
```
Generate a secret key with: `python -c "import secrets; print(secrets.token_urlsafe(50))"`

**If `pip install mysqlclient` fails:** edit `requirements.txt` (comment out `mysqlclient`, uncomment `PyMySQL`), run `pip install PyMySQL`, and uncomment the two lines in `backend/config/__init__.py`.

**Try it without MySQL:** set `DB_ENGINE=sqlite` in `.env`.

### 1.3 Frontend — **Terminal 2** (PowerShell)
```powershell
cd restaurant-pos\frontend
npm install
Copy-Item .env.example .env          # VITE_API_URL=http://127.0.0.1:8000/api
npm run dev                          # http://localhost:5173
```

### 1.4 Log in
`seed_demo_data` creates (**change these passwords before real use**):

| User | Password | Role |
|---|---|---|
| admin | Admin@12345 | Admin |
| manager | Manager@12345 | Manager |
| cashier | Cashier@12345 | Cashier |

Django admin (internal maintenance): http://127.0.0.1:8000/admin/

### 1.5 Tests
```powershell
# Terminal 1 (backend venv active), from restaurant-pos\backend
$env:DB_ENGINE="sqlite"; python manage.py test apps      # or run against MySQL: needs CREATE privilege for test_restaurant_pos
# Terminal 2, from restaurant-pos\frontend
npm test
```

---

## 2. Roles

| Capability | Cashier | Manager | Admin |
|---|:-:|:-:|:-:|
| POS billing, kitchen, tables, customers | ✔ | ✔ | ✔ |
| See orders | own only | all | all |
| Discount | up to cashier limit (default 10%) | any | any |
| Menu, categories, inventory, reports | – | ✔ | ✔ |
| Cancel orders, refunds | – | ✔ | ✔ |
| Settings, users | view only (Manager) | view | edit |

All of this is enforced by DRF permission classes on the backend, not only hidden in the UI.

## 3. Architecture

```
backend/apps/
  common/      pagination, error shape, permissions, idempotency, seed command
  accounts/    User(role), login throttle, /auth/*, /users/, /staff/
  settings_app RestaurantSettings (singleton row)
  audit/       append-only AuditLog
  menu/        Category, MenuItem (image validation)
  tables/      RestaurantTable
  customers/   Customer
  orders/      Order, OrderItem, HeldOrder; services/billing.py (pure maths),
               services/orders.py (create), services/lifecycle.py (kitchen/cancel/complete/transfer/merge); kitchen views
  payments/    Payment, Refund; services.py (record payments, refunds, payment status)
  inventory/   Supplier, Ingredient, Recipe(+Ingredient), StockMovement; services.py
  reports/     query services, dashboard, CSV export
frontend/src/  api/ components/ context/ hooks/ layouts/ pages/ routes/ types/ utils/
```
Views are thin; business rules live in `services/` and are what the tests target. The kitchen endpoints live in `orders/` because they only change `Order` fields.

### Database relationships
`Category 1─* MenuItem` · `MenuItem 1─1 Recipe 1─* RecipeIngredient *─1 Ingredient *─1 Supplier` · `RestaurantTable 1─* Order` · `Customer 1─* Order` · `User(cashier) 1─* Order` · `Order 1─* OrderItem *─1 MenuItem` · `Order 1─* Payment` · `Order 1─* Refund` · `Order 1─* StockMovement *─1 Ingredient` · `User 1─* HeldOrder` · `AuditLog` and `IdempotencyRecord` reference users loosely.

Constraints worth knowing: `Payment.amount > 0`, `Refund.amount > 0`, `OrderItem.quantity >= 1`, `MenuItem.price >= 0`, unique `order_number` / `invoice_number`, unique `(order, ingredient, movement_type)` on stock movements (second guard against double deduction), unique `Payment.idempotency_key`.

## 4. Billing rules (all in `orders/services/billing.py`)
1. The backend loads current prices and tax rates from the menu; submitted prices/totals are ignored.
2. All money is `Decimal`, rounded half-up to 2 places. Percent discounts are applied to the subtotal and **spread across lines** (last line takes the rounding remainder, so line discounts always sum exactly).
3. Tax is computed per line **after** discount, at each item's own GST rate. Tax-inclusive pricing is a setting. The receipt splits tax into CGST/SGST (half each) per rate.
4. Optional round-off to the nearest rupee is stored separately.
5. Discount over the user's limit → 403 and nothing is created.
6. Payments: full payment required unless "allow partial payments" is on; over-payment is rejected; cash change = tendered − cash amount; split payments are separate rows; card/UPI store only a reference (card: last 4 digits).
7. `status` (order lifecycle), `kitchen_status`, and `payment_status` are independent. An order auto-completes when the kitchen has finished **and** it is fully paid, or a user presses *Complete*.
8. Invoice number is issued when the order becomes fully paid: `{prefix}{year}-{counter:06d}`, from a counter row locked inside the transaction.
9. Completed orders cannot be cancelled or edited; use a recorded, manager-approved **refund**. Nothing is hard-deleted; menu items, tables, users, and categories are deactivated.
10. Cancel, refund, discount, stock adjustments, settings and user changes are written to the audit log.

**Idempotency:** the frontend sends an `Idempotency-Key` header on order creation and payments. A retry with the same key and body returns the stored response (`Idempotent-Replay: true`); the same key with a different body gets 409. A request that fails rolls back, so its key can be reused. Per-payment keys add a unique database guard.

**Inventory:** ingredients are deducted once, when an order completes (guarded by `Order.stock_deducted` and a database unique constraint). A *full* refund with "restock" writes REVERSAL rows once. Partial refunds cannot restock. If "allow negative stock" is off and stock is short, completion is blocked with a clear message.

**Concurrency notes:** order creation locks the settings row (numbering) and the table row; payments lock the order row. This is safe on InnoDB for one server process. Order creation is serialized by the counter lock, which is fine for a single restaurant. Not designed for multi-branch scale.

## 5. API summary
Base `http://127.0.0.1:8000/api/`. Lists: `{count,next,previous,results}` with `?page=&page_size=&search=&ordering=`. Errors: `{"error":{"code","message","details"}}`. Auth: `Authorization: Bearer <access>`.

| Area | Endpoints |
|---|---|
| Auth | `POST auth/login/` · `POST auth/refresh/` · `POST auth/logout/` · `GET/PATCH auth/me/` · `GET staff/` (manager+) |
| Users | `/users/` CRUD (admin; delete = deactivate) |
| Menu | `/menu/items/` (filters: `category,is_veg,is_available,is_active,include_inactive,search`, multipart for image) · `/menu/categories/` |
| Tables | `/tables/` (includes `current_order`) |
| Orders | `GET/POST orders/` · `GET orders/{id}/` · `POST orders/calculate/` · `GET orders/{id}/receipt/` · `POST orders/{id}/cancel/` `complete/` `transfer-table/` `merge/` · `GET/POST orders/{id}/payments/` · `GET/POST orders/{id}/refunds/` · `/orders/held/` |
| Kitchen | `GET kitchen/orders/` · `PATCH kitchen/orders/{id}/status/` `{status: PREPARING|READY|COMPLETED}` |
| Customers | `/customers/` · `GET customers/{id}/orders/` |
| Inventory | `/inventory/items/` (`?low_stock=true`) · `/inventory/suppliers/` · `/inventory/recipes/` · `GET inventory/movements/` · `POST inventory/adjust/` |
| Reports | `GET dashboard/summary/` · `dashboard/sales-chart/?days=7|30` · `reports/sales/` · `reports/payments/` · `reports/top-items/` · `reports/export-csv/?type=sales|orders|payments|top-items|categories|cashiers` (all take `date_from`, `date_to`) |
| Settings | `GET/PATCH settings/restaurant/` · `GET audit-logs/` |

Create order example:
```json
POST /api/orders/   (header Idempotency-Key: <uuid>)
{ "order_type":"DINE_IN", "table_id":3,
  "items":[{"menu_item_id":12,"quantity":2,"notes":"less spicy"}],
  "discount_type":"PERCENT", "discount_value":"5",
  "customer_name":"Ravi", "customer_phone":"9876500001",
  "payments":[{"method":"CASH","amount":"200.00","tendered":"500"},{"method":"UPI","amount":"262.00","reference":"UTR123"}] }
```

## 6. Environment variables
Backend `.env`: `DJANGO_SECRET_KEY` (required when `DJANGO_DEBUG=False`), `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `DB_ENGINE` (`mysql`/`sqlite`), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `JWT_ACCESS_MINUTES` (15), `JWT_REFRESH_DAYS` (1), `LOGIN_THROTTLE_RATE` (10/min), `SECURE_SSL_REDIRECT`.
Frontend `.env`: `VITE_API_URL`.

## 7. Receipts and printing
In POS or Orders, open a bill and choose **80 mm thermal** or **A4**, then **Print**. The page injects the right `@page` size and prints only the receipt. To get a PDF, pick *Save as PDF* in the print dialog (no server-side PDF in this version). For thermal printers, install the printer driver in Windows and choose it in the dialog; set margins to *None* if your driver adds them.

## 8. Tax and legal
Tax rates are **per menu item** and fully configurable. Nothing assumes a single GST rate. You, the owner, must set rates according to the rules that apply to your business and obtain professional tax advice. The CGST/SGST split shown on receipts is a simple 50/50 presentation; inter-state or composition-scheme cases are not handled. Verify invoice format requirements with your tax advisor.

## 9. Security
Passwords use Django's hashers and validators. JWT access tokens last 15 minutes; refresh tokens rotate and are blacklisted on logout. Tokens are in `localStorage` and sent in the `Authorization` header (so CSRF does not apply); that means an XSS bug would expose them, and the app deliberately renders no user HTML. Login is rate-limited. Uploads are limited to JPG/PNG/WEBP up to 2 MB. CORS is an explicit allow-list. Card numbers and CVVs are never accepted or stored. With `DJANGO_DEBUG=False`, errors return a generic JSON 500 (no stack traces), and HTTPS-related settings switch on.

## 10. Production deployment (outline)
1. Linux or Windows server, Python 3.11+, MySQL 8 / MariaDB 10.6+. Set `DJANGO_DEBUG=False`, a strong `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS=https://pos.example.com`.
2. `pip install gunicorn` (Linux) or `waitress` (Windows); run `python manage.py collectstatic`, `migrate`.
3. Frontend: set `VITE_API_URL=https://pos.example.com/api`, `npm run build`, serve `frontend/dist` with Nginx/Caddy. Proxy `/api`, `/admin`, and `/media` to Django, or serve media from the web server.
4. Terminate **HTTPS** at the proxy. Use a dedicated MySQL user (not root) with only this database's rights. Put the rate-limit cache on Redis if you run several workers (the default in-memory cache is per process).
5. Schedule daily backups (below). Change the demo passwords or never run the seed command in production.

## 11. Backup and restore
```powershell
# Backup (from C:\xampp\mysql\bin)
.\mysqldump.exe -u root -p --single-transaction restaurant_pos > D:\backups\pos_$(Get-Date -Format yyyy-MM-dd).sql
# Restore into an empty database
.\mysql.exe -u root -p restaurant_pos < D:\backups\pos_2026-01-31.sql
```
Also copy `backend\media\` (menu photos) and `backend\.env`. Use Windows Task Scheduler for a daily job, keep copies off the machine, and practise a restore.

## 12. Known limitations
- **Items cannot be added to an order after it is placed.** Place a second order and **merge** them (merge is API-only: `POST /api/orders/{id}/merge/`, manager; it resets discounts) — there is no merge button in the UI yet.
- No server-side PDF; use the browser's print-to-PDF.
- Kitchen screen uses 5-second polling, not WebSockets.
- Sales are counted on the day an order is placed (cancelled orders excluded). `net_sales = total billed − tax − refunds`; tax on refunded amounts is not proportionally reversed. Day/week/month grouping is done in Python so it works even without MySQL time-zone tables.
- Refunds record the money going back; they do not move money through a payment gateway.
- No gateway integration (UPI/card are recorded manually), no multi-branch, no offline mode, no delivery-partner integration.
- Menu images are served by Django only when `DEBUG=True`; in production serve `/media` from your web server.
- The production JS bundle is ~800 KB (240 KB gzipped); code-splitting is a straightforward later optimisation.
