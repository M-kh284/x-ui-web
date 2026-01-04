# ساخت یوزر X-UI

یک وب اپلیکیشن برای مدیریت کاربران و ساخت کانفیگ VPN از طریق پنل X-UI

## قابلیت‌ها

- ثبت‌نام و ورود کاربران با ایمیل
- فراموشی رمز عبور
- ساخت کانفیگ در هر Inbound (یکی در هر Inbound)
- 30 روز اعتبار + 100GB ترافیک
- پشتیبانی از پروتکل‌های VMESS, VLESS, Trojan, Shadowsocks
- نمایش QR Code و کپی لینک کانفیگ
- پنل مدیریت برای ادمین
- رابط کاربری فارسی

## پیش‌نیازها

- Node.js نسخه 10 یا بالاتر
- پنل X-UI نصب شده و فعال

## نصب

1. کلون کردن پروژه:
```bash
git clone <repository-url>
cd x-ui-web
```

2. نصب وابستگی‌ها:
```bash
npm install
```

3. تنظیم فایل `config.js`:
```javascript
module.exports = {
    PANEL_URL: 'https://your-panel.com:2053',
    PANEL_USERNAME: 'admin',
    PANEL_PASSWORD: 'your-password',
    PORT: 3000,
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin123'
};
```

یا با متغیرهای محیطی:
```bash
export PANEL_URL=https://your-panel.com:2053
export PANEL_USERNAME=admin
export PANEL_PASSWORD=your-password
export PORT=3000
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=your-admin-password
```

## اجرا

```bash
npm start
```

سرور روی پورت 3000 اجرا می‌شود: `http://localhost:3000`

## اجرا با PM2 (پیشنهادی برای پروداکشن)

```bash
# نصب PM2
npm install -g pm2

# اجرا
pm2 start server.js --name x-ui-web

# مشاهده لاگ‌ها
pm2 logs x-ui-web

# ری‌استارت
pm2 restart x-ui-web

# توقف
pm2 stop x-ui-web
```

## ساختار فایل‌ها

```
x-ui-web/
├── config.js          # تنظیمات پنل و ادمین
├── server.js          # سرور Express
├── package.json       # وابستگی‌ها
├── users.json         # دیتابیس کاربران (خودکار ساخته می‌شود)
└── public/
    ├── index.html     # صفحه اصلی کاربران
    ├── app.js         # منطق فرانت‌اند کاربران
    ├── admin.html     # پنل مدیریت
    ├── admin.js       # منطق فرانت‌اند ادمین
    └── style.css      # استایل‌ها
```

## پنل مدیریت

دسترسی به پنل مدیریت: `http://localhost:3000/admin`

قابلیت‌های پنل مدیریت:
- مشاهده لیست همه کاربران
- افزودن کاربر جدید
- تغییر رمز عبور کاربران
- حذف کاربران
- جستجو در کاربران

## API ها

### API کاربران

| مسیر | متد | توضیحات |
|------|-----|---------|
| `/api/user/register` | POST | ثبت‌نام کاربر جدید |
| `/api/user/login` | POST | ورود کاربر |
| `/api/user/logout` | POST | خروج کاربر |
| `/api/user/check` | GET | بررسی وضعیت نشست |
| `/api/user/forgot-password` | POST | درخواست بازیابی رمز |
| `/api/user/reset-password` | POST | تغییر رمز عبور |
| `/api/inbounds` | GET | دریافت لیست Inbound ها |
| `/api/create-config` | POST | ساخت کانفیگ جدید |

### API ادمین

| مسیر | متد | توضیحات |
|------|-----|---------|
| `/api/admin/login` | POST | ورود ادمین |
| `/api/admin/logout` | POST | خروج ادمین |
| `/api/admin/check` | GET | بررسی نشست ادمین |
| `/api/admin/users` | GET | لیست همه کاربران |
| `/api/admin/users` | POST | افزودن کاربر جدید |
| `/api/admin/users/:username` | GET | جزئیات کاربر |
| `/api/admin/users/:username` | DELETE | حذف کاربر |
| `/api/admin/users/:username/reset-password` | POST | تغییر رمز کاربر |

## نکات امنیتی

- فایل `config.js` را به `.gitignore` اضافه کنید
- از HTTPS استفاده کنید
- رمز عبور قوی برای پنل انتخاب کنید
