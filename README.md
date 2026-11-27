# ATOL Accounting: сайт

- `public/` е готовият сайт (index.html, styles.css, app.js, assets/ с логата).
- `src/` е изходният код. След промяна: `python3 build.py`.
- `server.js` е малък Node сървър без рамки: сервира сайта и приема формите.

## Стартиране
    npm install   # по желание, само за известия по имейл
    npm start     # http://localhost:3000

## API
- `GET /api/slots?date=ГГГГ-ММ-ДД` връща заетите часове за деня.
- `POST /api/booking` записва среща (проверява полета, работен ден, до 60 дни напред, без двойни часове).
- `POST /api/contact` записва запитване.
Защити: капан за ботове, лимит 5 заявки / 10 мин. на IP, лимит на размера, CSP заглавки.
Записите отиват в `data/bookings.json` и `data/messages.json`.

## Известия по имейл (Microsoft 365)
Задайте променливи на средата: `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `NOTIFY_TO`.
Без тях известията се печатат в конзолата.

## Лога (public/assets)
- logo-light.svg / logo-dark.svg: вертикално лого за светъл и тъмен фон
- logo-dark-bg.svg: вертикално лого върху сливов фон
- logo-horizontal-light.svg / logo-horizontal-dark.svg: хоризонтално лого за меню
- mark-light.svg / mark-dark.svg: само знакът (иконка, favicon)

## Публикуване в Railway
1. В Railway: New Project → Deploy from GitHub repo → изберете репото.
2. Добавете Volume с mount path `/data` и променлива `DATA_DIR=/data` (иначе заявките се губят при всяко ново пускане).
3. По желание: SMTP променливите от `.env.example` за известия по имейл.
4. Settings → Networking → Generate Domain, после Custom Domain за atolacc.bg.
Railway стартира `node server.js` и проверява `/healthz`.
