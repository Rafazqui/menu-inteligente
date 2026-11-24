# Mesa App: HR Coffee & Deli

Web app for each table in the café: customers scan the table's QR (or tap the NFC sticker) and from their phone they can:

1. **Play for the table's prize** (wheel, scratch card, or tic-tac-toe vs. the machine), one try per visit.
2. **See the menu** (the PDF, shown page by page).
3. **Browse the game library** (covers, flip to the back cover, request it from the waiter).
4. **Call the waiter**, with an optional message ("Agua natural", "La cuenta"...).
5. **Play minigames** while they wait (Hot Cake Tower and Minesweeper).
6. A separate invitation to **leave a Google review** (no prize in exchange, per Google's policies).

Staff use the **live panel** (`/admin`): alerts with sound, the table map, table approval and closing. The owner also has **Configuration** (probabilities, prizes, game library, menu, tables, staff) and the **QR tents** ready to print.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Initial users (change them under Configuration → Staff):

| User | Password | Role |
|---|---|---|
| `admin` | `hrcoffee2026` | Owner |
| `mesero` | `mesero2026` | Staff |

To simulate a table: log in to `/admin/qr` and open the URL under any QR.

### Testing from your phone (same Wi-Fi)

```powershell
$env:DEV_ORIGINS="192.168.1.50"   # your PC's IP (ipconfig)
npx next dev -H 0.0.0.0
```
Then open `http://192.168.1.50:3000/admin/qr` and scan a QR with your phone.

## How security works

- **QR with a random token** (`/m/Ab3...`), not the table number: you can't guess other tables' URLs.
- **The waiter approves each table** the first time it's scanned. Someone with a photo of the QR can't do anything from outside the café. When the table is closed (they left), every phone at that table is disconnected.
- **Signed cookies** (JWT HS256, httpOnly): the customer can't pretend to be another table.
- **Prizes decided on the server**: the wheel and scratch card only animate the result; tic-tac-toe validates every move on the server. One prize per visit, enforced in the database (even if 2 phones press at the same time).
- **Limits**: cooldown between waiter calls, rate limits on requests, and login brute-force protection.
- **CSRF**: SameSite cookies + Origin header check.
- **Uploads**: the real file type is checked (not just the extension), with a size limit and random names.

## Structure

```
src/app/m/[token]       QR/NFC entry point (creates or joins the table session)
src/app/mesa/*          Customer screens (phone)
src/app/admin/*         Staff panel
src/app/api/*           API (mesa/*, admin/*, uploads)
src/lib/                Database, auth, prizes, tic-tac-toe AI, events
data/                   SQLite + uploaded files (created on its own, not committed to git)
```

## Production

Needs a server that keeps the process running (the live alerts use Server-Sent Events) and **a persistent disk** for `data/`: Railway, Render, Fly.io or a VPS. Environment variables:

- `PUBLIC_BASE_URL`: public domain, e.g. `https://mesa.hrcoffee.mx` (this is what the printed QRs point to).
- `AUTH_SECRET`: a long random key (if missing, one is generated in `data/.auth-secret`).
- `DATA_DIR`: (optional) where to store the database and files.

## Ready for more businesses

Every table in the database has `restaurant_id`. To sell it to other cafés: move SQLite → PostgreSQL, swap the in-memory event bus for Redis/Postgres pub-sub, and add branding per business (logo/colors are already stored in `restaurants`).
