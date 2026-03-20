# HotKey Delivery Mini App — production-oriented starter

Это не игрушечный JSON-MVP, а стартовая версия под:
- PostgreSQL + Prisma
- реальную Telegram `initData` валидацию
- local file storage для QR/чеков
- rate limiting
- HTTPS через Caddy
- клиент / курьер / саппорт / админ

## Быстрый старт локально

1. Скопируйте `.env.example` в `.env` и заполните `TELEGRAM_BOT_TOKEN`.
2. Поднимите Postgres.
3. Установите зависимости: `npm install`
4. Сгенерируйте Prisma client: `npm run prisma:generate`
5. Примените миграции: `npm run prisma:migrate`
6. Выполните seed: `npm run seed`
7. Запустите приложение: `npm run dev`

Для dev-входа можно оставить `ALLOW_DEV_BYPASS=true` и открывать:
- `http://localhost:3000/?devUser=1&username=admin`
- `http://localhost:3000/?devUser=2&username=support`
- `http://localhost:3000/?devUser=3&username=courier`
- `http://localhost:3000/?devUser=55&username=user55`

## Telegram production auth

В проде:
- `ALLOW_DEV_BYPASS=false`
- фронт должен передавать `Telegram.WebApp.initData` в заголовке `x-telegram-init-data`
- сервер валидирует подпись через бот-токен

## Деплой с HTTPS

1. Укажите реальный домен в `deploy/Caddyfile`
2. Скопируйте `.env.example` в `.env`
3. Запустите: `docker compose up -d --build`
4. Выполните миграции и seed внутри контейнера app

Пример:
```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app node prisma/seed.cjs
```

## Что уже учтено

- 1 активный заказ на 1 курьера
- условное взятие заказа, чтобы два курьера не взяли один заказ
- баланс не уходит в минус
- пополнение только через саппорта
- QR временный, чек постоянный
- магазин и адрес магазина вводятся вручную
- время бизнеса — город Горячий Ключ
