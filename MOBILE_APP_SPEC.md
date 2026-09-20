# Alpha CIMS — mobil ilova (iOS) uchun funksional spetsifikatsiya

**Sana:** 2026-09-20
**Manba:** veb-ilovaning hozirgi holati (`Alfa-FCUI`, master). Bu hujjat — veb-saytda **qaysi sahifada nima bor** va **mobil ilovada u qanday ishlashi kerak** degan savolga javob. Dizayn haqida emas, faqat funksiya haqida.

**API:** `https://api.alpha.cognilabs.org` (FastAPI, OpenAPI `/openapi.json`). Barcha javoblar `{ "data": ..., "meta"?: { page, page_size, total, total_pages } }`.

---

## 0. Ilovaning umumiy qoidalari

### 0.1 Autentifikatsiya
| Nima | Qanday |
|------|--------|
| Kirish | `POST /auth/login` `{ phone_or_email, password }` → `{ access_token, refresh_token }` |
| Yangilash | `POST /auth/refresh` `{ refresh_token }` — access token muddati tugab `401` kelganda avtomatik chaqiriladi, so'rov qayta yuboriladi. Refresh ham yiqilsa → tokenlar o'chiriladi, login ekraniga |
| Joriy foydalanuvchi | `GET /auth/me` → `{ user: { id, full_name, phone, email, is_super_admin, roles: [{name}], status }, permissions: [string] }` — ilova ochilganda har safar chaqiriladi; `user` bo'lmasa → login |
| Chiqish | tokenlar lokal o'chiriladi (serverda endpoint yo'q) |
| Xato matnlari | server `detail` matni inglizcha; frontendda `api-errors.ts` jadvali orqali UZ/RU ga tarjima qilinadi (masalan `Invalid credentials` → "Telefon/email yoki parol noto'g'ri"). Mobil ilova ham shu jadvalni ko'chirib olsin |

**iOS uchun:** tokenlarni Keychain'da saqlash; Face ID / Touch ID bilan qayta kirish (refresh token saqlangan bo'lsa parolsiz); ilova fon rejimidan qaytganda `/auth/me` ni qayta chaqirish shart emas — faqat 401 bo'lsa.

### 0.2 Rollar va ruxsatlar
Menyu bandlari va amallar ruxsatga qarab ko'rsatiladi. Ruxsat ikki manbadan yig'iladi: (1) lokal rol xaritasi (`rbac.ts`), (2) `/auth/me` dagi `permissions` (shaxsiy qo'shimcha ruxsatlar). `is_super_admin` → hammasi.

| Rol | Ko'radi |
|-----|---------|
| Super Admin | hammasi + rol almashtirish (test uchun boshqa rol ko'zi bilan ko'rish) |
| Admin | o'quvchilar, guruhlar, sessiyalar, shartnomalar, tranzaksiyalar, hisobotlar, foydalanuvchilar, sozlamalar |
| Director | faqat ko'rish: o'quvchilar, guruhlar, sessiyalar, hisobotlar, shartnomalar, tranzaksiyalar, xarajatlar, sozlamalar, audit |
| Accountant | o'quvchilar, hisobotlar, shartnomalar, tranzaksiyalar, xarajatlar (tahrirlash bilan) |
| Head Coach | o'quvchilar, guruhlar (tahrirlash), sessiyalar (yaratish/boshqarish), davomat, natijaviy jadval |
| Coach | o'quvchilar, guruhlar, o'z sessiyalari, davomat belgilash |

Ruxsat kodlari: `students:view/edit`, `groups:view/edit`, `attendance:view`, `attendance:coach:mark`, `sessions:create/manage`, `reports:dashboard:view`, `reports:attendance:view`, `contracts:view/edit`, `finance:transactions:view/manual/cancel`, `finance:unassigned:view/assign`, `finance:expenses:view/edit`, `users:manage`, `roles:manage`, `settings:system:view/edit`, `gate:logs:view`.

**Muhim:** murabbiylar (`Coach`) uchun ba'zi endpointlar boshqacha: guruhlar `GET /coach/groups`, sessiyalar `GET /coach/sessions`, sessiya tafsiloti `GET /coach/sessions/{id}`. Admin uchun `GET /groups`, `GET /head-coach/sessions`. Vebda "rolga qarab uchalasini so'rab, ishlaganini olish" usuli ishlatilgan (`apiGetGroupsForSelect`). Mobilda rolni bilgan holda to'g'ri endpointni chaqirish kifoya.

### 0.3 Til va formatlar
- Ikki til: **UZ** (lotin) va **RU**. Lug'at `src/shared/i18n/lang.tsx` da (~980 kalit) — mobil ilova shu kalitlarni ko'chirsin. RU da sondan keyingi so'zlar ko'plik shaklida (`1 сессия / 2 сессии / 5 сессий`).
- Pul: `so'm` / `сум`, minglik ajratgich bilan (`1,500,000 so'm`); katta summalar `1.5 mln` / `1,5 млн`.
- Sana: `15 Sentabr 2026` / `15 сентября 2026`; API bilan `YYYY-MM-DD`.
- Vaqt: `HH:mm`. Vaqt mintaqasi — Asia/Tashkent (server ham shunda).

### 0.4 Umumiy holatlar (har bir ekranda)
- Yuklanmoqda (skeleton/spinner), bo'sh ro'yxat ("... yo'q"), xato (tarjima qilingan matn + qayta urinish).
- Barcha ro'yxatlar sahifalanadi: `page`, `page_size`. Cheklovlar: `/transactions` ≤ 100, `/students` ≤ 500, qolganlari odatda ≤ 100. Mobilda **cheksiz scroll** (keyingi sahifani pastga yetganda yuklash).
- O'chirish va boshqa qaytarib bo'lmaydigan amallar oldidan tasdiqlash oynasi.
- Muvaffaqiyatli amaldan keyin qisqa xabar (toast).

### 0.5 Mobil navigatsiya (taklif)
Pastki tab bar — rolga qarab:

| Tab | Nima | Kim uchun |
|-----|------|-----------|
| Bosh sahifa | dashboard | `reports:dashboard:view` |
| O'quvchilar | ro'yxat → profil → tahrirlash / yangi o'quvchi | `students:view` |
| Sessiyalar | kalendar → sessiya → davomat belgilash | `attendance:view` |
| Moliya | tranzaksiyalar, shartnomalar, xarajatlar, hisobotlar | moliya ruxsatlari |
| Yana | guruhlar, natijaviy jadval, kutish ro'yxati, foydalanuvchilar, audit, sozlamalar, profil, til, tema, chiqish | qolganlari |

Murabbiy uchun tab bar: Bosh sahifa · Sessiyalar · O'quvchilar · Guruhlar · Yana.

---

## 1. Kirish (Login)

**Vebda bor:** telefon/email + parol; "meni eslab qol"; parolni ko'rsatish; til almashtirish (UZ/RU); xato matni tarjima qilinadi (noto'g'ri parol, hisob faol emas, internet yo'q).

**API:** `POST /auth/login`.

**Mobilda:** shu forma + Face ID/Touch ID; klaviatura turi telefon uchun `phonePad`; til tanlash birinchi ochilishda; "parolni unutdim" — hozir ishlamaydi (backendda endpoint yo'q), tugmani ko'rsatmaslik.

---

## 2. Bosh sahifa (Dashboard)

**Vebda bor:**
- Salomlashuv (kun vaqtiga qarab) + bugungi sessiyalar soni.
- 4 ta KPI kartasi: **Faol o'quvchilar** (→ o'quvchilar ro'yxati, "faol" filtri), **Bugungi sessiyalar** (nechtasi tugadi / hozir ketyapti / kutilmoqda; → sessiyalar), **30 kunlik tushum** (Payme/Click/Naqd ulushi; → tranzaksiyalar), **Qarzdorlar** (soni, faol o'quvchilarga nisbati; → hisobotlar → qarzdorlar).
- **Moliyaviy analitika** paneli: oxirgi 30 kun kunlik tushum grafigi, oldingi 30 kunga nisbatan o'zgarish %, MRR (faol shartnomalar oylik summasi), shu oy yig'ilgani va rejadan %, o'rtacha to'lov, manbalar bo'yicha summalar.
- **Guruhlar** paneli: har guruh — faol o'quvchilar / sig'im (sig'im API'da bo'lmasa 25 deb olinadi), to'ldirilish chizig'i; bosilsa guruh tafsiloti.
- **Moliya — so'nggi 30 kun** qatori: jami tushum, tranzaksiyalar soni, manbalar.

**API:** `GET /reports/dashboard/summary` (today_revenue, active_students, total_debtors, today_sessions, last_7/30/90_days{total_inflow, successful_transactions, source_breakdown[]}); `GET /head-coach/sessions?date=YYYY-MM-DD` (bugungi); `GET /groups?page_size=100`; analitika uchun `GET /reports/revenue-dynamics?group_by=day` + `GET /reports/kpis` (yangi backend) yoki `GET /transactions` + `GET /contracts/stats` (eski).

**Ruxsat:** `reports:dashboard:view`.

**Mobilda:** KPI kartalari bosiladigan (deep link tegishli ekranga); grafik gorizontal surish bilan; "pull-to-refresh". Murabbiy uchun moliya bo'limlarini yashirish (ruxsati yo'q → 403).

---

## 3. O'quvchilar

### 3.1 Ro'yxat
**Vebda bor:**
- Status tablari: Barchasi / Faol / Nofaol / Arxiv / O'chirilgan (`status` filtri; "Barchasi" = `include_archived=true`).
- Qidiruv: ism, telefon, PNFL, manzil (`search`). Guruh filtri (`group_id`).
- Jadval: avatar+ism, shartnoma raqami · yosh, guruh, tug'ilgan sana, telefon, status.
- Qator amallari: ochish, o'chirish (status DELETED ga o'tadi). Bir nechtasini tanlab o'chirish (`POST /students/bulk-delete`).
- Excel eksport (`GET /students/comprehensive-export`).
- Sahifalash 10 tadan, 5 talik bloklar. Filtrlar sessiyada eslab qolinadi.
- "Yangi o'quvchi" tugmasi.

**API:** `GET /students?search&group_id&status&include_archived&page&page_size`, `GET /contracts?page_size=…` (shartnoma raqamlari uchun), `DELETE /students/{id}`, `POST /students/bulk-delete {ids}`.

**Ruxsat:** `students:view`; o'chirish/yaratish — `students:edit`.

**Mobilda:** qidiruv maydoni yuqorida (debounce 300 ms); status — segment; guruh — filtr varag'i (bottom sheet); ro'yxat elementi bosilsa profil; chapga surish → o'chirish (tasdiq bilan); ko'p tanlash — uzoq bosish. Excel eksport — "Share sheet" orqali faylni ulashish.

### 3.2 O'quvchi profili
**Vebda bor:**
- Sarlavha: avatar, ism, status, davomat %, yosh · tug'ilgan sana, guruh, murabbiy. Tugmalar: **Tahrirlash**, **Shartnoma** (PDF ochish).
- Tablar:
  - **Umumiy** — shaxsiy ma'lumotlar (tug'ilgan sana, millati, qon guruhi, bo'y/vazn, PNFL, telefon, manzil, qo'shilgan sana), mijoz (ota-ona: to'liq ismi, pasport, manzil), tezkor statistika (jami trening, kelgan/kelmagan, kechikishlar, oylik to'lov, rasmiy hisobot: sessiyalar/kelgan/kelmagan/kechikkan).
  - **Davomat** — so'nggi 14 ta qayd (sana, status, izoh), kelgan/kechikkan/kelmagan soni.
  - **Shartnoma** — joriy shartnoma: raqam, status, boshlanish/tugash, oylik to'lov; shartnoma yo'q bo'lsa — "yo'q" (yoki prorated bo'lsa "…da avtomatik yaratiladi").
  - **To'lovlar** — so'nggi 10 ta tranzaksiya (sana, manba, oylar, summa, status; INITIAL = "birinchi to'lov" belgisi).
  - **Fayllar** — profil rasmi, pasport nusxasi, qo'shimcha fayl: bor/yo'q, yuklab olish, (qayta) yuklash.
- **Tahrirlash** oynasi: ism, familiya, tug'ilgan sana, bo'y, vazn, PNFL, telefon, qon guruhi, millati, manzil, **guruhni o'zgartirish** (alohida endpoint).
- **To'liq o'chirish** (hard delete) — tasdiq bilan, qaytarib bo'lmaydi.

**API:** `GET /students/fullinfo/{id}` (student, group, coach, contract, attendances), `GET /students/{id}/transactions`, `GET /students/{id}/gatelogs`, `GET /reports/attendance/students/{id}`, `PATCH /students/{id}` (multipart), `PATCH /students/{id}/group?group_id=`, `DELETE /students/{id}/hard-delete`, `POST /students/{id}/photo|passport|extra-file` (multipart), fayl yuklab olish — `photo_url/passport_url/extra_file_url` (S3 havolalari), `GET /contracts/{id}/pdf` (blob).

**Mobilda:** tablar — segment yoki gorizontal scroll; telefon raqami bosilsa qo'ng'iroq; rasm/pasport — kamera yoki galereya; PDF — ilova ichida ko'rish + ulashish; "Guruhni o'zgartirish" — alohida picker.

### 3.3 Yangi o'quvchi (3 qadam)
**Vebda bor:**
1. **O'quvchi ma'lumotlari:** ism*, familiya*, tug'ilgan sana*, bo'y*, vazn*, PNFL*, telefon, qon guruhi, millati, manzil, guruh.
2. **Ota-ona va shartnoma:** mijoz to'liq ismi*, pasport raqami*, manzil*, oylik to'lov* (standart 500 000), forma to'lovi, shartnoma boshlanishi (bugun) va tugashi (31 dekabr).
   - **Birinchi qisqa to'lov (prorated)** tugmachasi — o'quvchi oy o'rtasida qo'shilganda: summa*, manba (naqd/Payme/Click/bank), davr boshlanishi (bugun), davr tugashi* (keyingi oyning 1-kuni), to'lov vaqti, izoh. Yoqilganda shartnoma boshlanishi = davr tugashi. Server bu maydonlarni qo'llab-quvvatlashi `/openapi.json` orqali tekshiriladi — yo'q bo'lsa tugmacha o'chiq.
3. **Fayllar va tasdiqlash:** profil rasmi, pasport nusxasi, qo'shimcha fayl (ixtiyoriy) → "O'quvchini yaratish".

Natija: o'quvchi + shartnoma (PDF serverda tayyorlanadi) → "Shartnomani ko'rish" (PDF) / ro'yxatga qaytish. Prorated bo'lsa — shartnoma keyin avtomatik yaratiladi, PDF tugmasi ko'rsatilmaydi.

**API:** `POST /students` (multipart: barcha maydonlar + `photo/passport/extra_file` + `initial_payment_*`), `GET /groups`, `GET /openapi.json` (prorated mavjudligini tekshirish), `GET /students/fullinfo/{id}`, `GET /contracts/{id}/pdf`.

**Mobilda:** qadamma-qadam ekranlar, har qadamda validatsiya; PNFL uchun raqamli klaviatura; kamera bilan rasm/pasport; qoralama saqlash (ilova yopilsa yo'qolmasin).

---

## 4. Guruhlar
**Vebda bor:**
- Ko'rinish: kartochkalar / ro'yxat; "arxivlanganlarni ko'rsatish".
- Karta: nomi, tavsif, murabbiy, faol o'quvchilar soni, kutish ro'yxati soni.
- Amallar: yangi guruh (nom*, tavsif, murabbiy), tahrirlash, o'chirish, bir nechtasini o'chirish, o'quvchilar Excel eksporti.
- Guruh tafsiloti (modal): ma'lumotlar (murabbiy, sig'im, faol o'quvchilar, kutish ro'yxati) + o'quvchilar ro'yxati (bosilsa profil).

**API:** `GET /groups?include_archived&page&page_size` (yoki `/coach/groups`, `/head-coach/groups`), `GET /groups/{id}`, `GET /groups/{id}/students`, `POST /groups`, `PATCH /groups/{id}`, `DELETE /groups/{id}`, `POST /groups/bulk-delete`, `GET /groups/{id}/export-students` (xlsx), `GET /users/coaches`.

**Ruxsat:** `groups:view`; o'zgartirish — `groups:edit`.

**Mobilda:** ro'yxat → guruh ekrani (ma'lumot + o'quvchilar); murabbiy uchun faqat o'z guruhlari.

---

## 5. Trening sessiyalari
**Vebda bor:**
- Tablar: **Sessiyalar** / **Mening davomatlarim** (murabbiy uchun — o'zi belgilagan davomatlar, guruh filtri).
- Haftalik kalendar: hafta oldinga/orqaga, "Bugun"; har kunda sessiyalar soni va guruh ranglari nuqtalari; kunni bosish → o'sha kun.
- Filtrlar: Bugun (standart) / Kelayotgan / O'tgan / Barchasi; guruh.
- Kunlar bo'yicha guruhlangan ro'yxat: har kun — sarlavha (kun, hafta kuni, sana, "Bugun/Ertaga/Kecha", nechta sessiya) va sessiyalar: vaqt (boshlanish — tugash, davomiyligi), mavzu, guruh, joy, status (Bugun/Kelayotgan/O'tgan).
- Sessiyani bosish → **davomat belgilash**.
- Amallar menyusi: tahrirlash, o'chirish.
- **Yangi sessiya:** guruh*, sanalar* (bir nechta sana tanlash mumkin — har biriga alohida sessiya), mavzu*, joy, boshlanish/tugash vaqti, izoh.

**API:** `GET /head-coach/sessions?date|from_date&to_date|group_id` (murabbiy: `/coach/sessions`), `POST /head-coach/sessions`, `POST /head-coach/sessions/bulk`, `PUT /head-coach/sessions/{id}`, `DELETE /head-coach/sessions/{id}`, `GET /coach/my-attendances?from_date&to_date&group_id`.

**Ruxsat:** ko'rish `attendance:view`; yaratish `sessions:create`; boshqarish `sessions:manage`.

**Mobilda:** haftalik kalendar gorizontal surish bilan; bugungi kun default; sessiya kartasi bosilsa davomat; uzoq bosish → tahrirlash/o'chirish; **sessiya boshlanishidan oldin lokal eslatma (notification)** — murabbiy uchun foydali.

---

## 6. Davomat belgilash (bitta sessiya)
**Vebda bor:**
- Sarlavha: mavzu, sana, vaqt, joy. Statistika: davomat %, kelganlar / kechikkanlar / kelmaganlar.
- "Hammasini belgilash": Keldi / Kelmadi.
- Har o'quvchi uchun karta: Keldi / Kechikdi / Kelmadi (uchta tugma) + izoh maydoni. Belgilash **darhol** saqlanadi (har bosishda `bulk-attendance` bitta yozuv bilan).
- "Saqlash" — hammasini bir yo'la yuborish.
- **Konspekt** yuklash: fayl (PDF/DOCX/rasm) + izoh; yuklanganini ko'rish.
- Server qoidasi: bir sessiya uchun davomat **bir marta** qilinadi (qayta urinish — xato).

**API:** `GET /coach/sessions/{id}` (yoki `/head-coach/sessions/{id}`) — sessiya + mavjud davomatlar; `GET /groups/{id}/students`; `POST /coach/sessions/{id}/bulk-attendance` `[{ student_id, status: present|late|absent, comment }]`; `POST /coach/sessions/{id}/upload-konspekt` (multipart).

**Ruxsat:** `attendance:coach:mark`.

**Mobilda:** bu **eng ko'p ishlatiladigan ekran** — bitta qo'l bilan: har o'quvchi qatorida uchta katta tugma, default "Keldi"; belgilash oflaynda ham qolib, internet kelganda yuborilsin (navbat); "Hammasi keldi" tezkor tugma; konspekt — kamera bilan suratga olish.

---

## 7. Natijaviy jadval (Performance)
**Vebda bor:**
- Guruh va mavsum yili tanlanadi.
- Matritsa: qatorlar — o'quvchilar, ustunlar — o'yinlar (sana, raqib, tur). Katak qiymatlari: gol (⚽ soni), uzatma, sariq kartochka, kelmagan, o'ynagan.
- Tahrirlash rejimi: katakka bosish qiymatni almashtiradi → "Saqlash".
- O'yin qo'shish (sana, raqib*, tur), o'yinni tahrirlash/o'chirish, ustunlarni qayta tartiblash, Excel eksport.

**API:** `GET /coach/groups/{gid}/performance-table?season_year`, `PUT …/performance-table` (butun jadval), `POST …/performance-table/columns` (o'yin), `PATCH …/columns/{match_id}`, `DELETE …/columns/{match_id}`, `PATCH …/columns-reorder`, `GET …/performance-table/export`.

**Ruxsat:** `sessions:manage`.

**Mobilda:** matritsa ekranga sig'maydi — **o'yin bo'yicha ko'rinish**: o'yin tanlanadi → o'quvchilar ro'yxati, har biriga natija tanlash; yoki o'quvchi bo'yicha ko'rinish. Gorizontal scroll bilan jadval — faqat planshetda.

---

## 8. Shartnomalar
### 8.1 Ro'yxat
**Vebda bor:** jamlama (jami, faol/bekor/tugatilgan ulushi, jami oylik summa); tablar: Faol / Tugatilgan; qidiruv (raqam yoki o'quvchi); status filtri; jadval: raqam, o'quvchi (→ profil), boshlanish → tugash, oylik to'lov, status; "Tugatish" (sabab* bilan).

**API:** `GET /contracts?search&status&archive_year&page&page_size`, `GET /contracts/terminated`, `GET /contracts/stats`, `POST /contracts/{id}/terminate {reason}`.

### 8.2 Shartnoma tafsiloti
**Vebda bor:** asosiy ma'lumotlar (raqam, status, o'quvchi, mijoz, sanalar, oylik to'lov, yil), qo'shimcha (pasport, tug'ilish yili, bekor qilish sababi/sanasi/kim); to'lovlar statistikasi (to'langan, kutilgan = oylik × oylar, qarz) va shu shartnoma to'lovlari jadvali; amallar: PDF ochish, PDF qayta yaratish, statusni o'zgartirish, oylik to'lovni o'zgartirish, sanalarni o'zgartirish, tahrirlash (mijoz ismi, pasport), tugatish.

**API:** `GET /contracts/{id}`, `GET /students/{id}`, `GET /students/{id}/transactions`, `GET /contracts/{id}/pdf`, `POST /contracts/{id}/regenerate-pdf`, `PATCH /contracts/{id}`, `PATCH /contracts/{id}/status`, `PATCH /contracts/{id}/monthly-fee`, `PATCH /contracts/{id}/dates`, `POST /contracts/{id}/terminate`.

**Ruxsat:** `contracts:view`; o'zgartirish — `contracts:edit`.

**Mobilda:** ro'yxat → tafsilot; PDF ilova ichida + ulashish; o'zgartirish amallari — action sheet.

---

## 9. Tranzaksiyalar
**Vebda bor:**
- Jamlama: jami to'lov, Payme/Click/boshqa soni va ulushi, muvaffaqiyatli tranzaksiyalar soni.
- Filtrlar: doira (Barcha / Biriktirilmagan), manba (Payme/Click/Naqd/Bank), status (Kutilmoqda/To'langan/Bekor), yil, sana oralig'i. Hisobotlardan "bugungi tushum" bosilsa — bugungi sana filtri bilan ochiladi.
- Jadval: sana-vaqt, o'quvchi, manba, oylar, summa, status; INITIAL to'lov belgisi.
- Tafsilot oynasi: summa, manba, status, sana, oylar, to'lov turi va davri, o'quvchi, shartnoma, yil, tashqi ID, izoh, hujjat (chek) havolasi; amallar: bekor qilish, o'chirish.
- Bir nechtasini tanlab o'chirish.
- **Biriktirish** (biriktirilmagan to'lovlar uchun): o'quvchi ID + shartnoma ID.
- **Qo'lda to'lov kiritish:** shartnoma raqami* (qidiruv bilan), summa*, manba*, to'lov yili*, oylar* (bir nechta), to'lov sanasi, izoh; "hujjat bilan" varianti — chek fayli (PDF/JPG/PNG) majburiy.
- Excel eksport.

**API:** `GET /transactions/withname?payment_year&from_date&to_date&status&source&student_id&page&page_size`, `GET /transactions/unassigned`, `GET /transactions/transactionstatistics?from_date&to_date`, `GET /transactions/{id}`, `POST /transactions/manual`, `POST /transactions/manual/with-proof` (multipart), `PATCH /transactions/{id}/assign`, `PATCH /transactions/{id}/cancel`, `DELETE /transactions/{id}`, `POST /transactions/bulk-delete`, `GET /reports/payments-excel`, `GET /contracts?search=` (shartnoma qidirish).

**Ruxsat:** `finance:transactions:view`; qo'lda — `finance:transactions:manual`; bekor — `finance:transactions:cancel`; biriktirilmagan — `finance:unassigned:view/assign`.

**Mobilda:** filtrlar — bottom sheet; ro'yxat → tafsilot; qo'lda to'lov — alohida ekran, chekni kamera bilan; **QR/Payme/Click tugmalari yo'q** (to'lovlar tashqi tizimdan callback orqali keladi — `POST /payme/payment`, `POST /click/payment` — ilova bilan aloqasi yo'q).

---

## 10. Xarajatlar
**Vebda bor:**
- Filtrlar: tur (Barchasi / Doimiy / Bir martalik), kategoriya (ijara, oyliklar, kommunal, jihozlar, transport, marketing, boshqa), davr (standart — oxirgi 3 oy).
- Jamlama: davr uchun jami, doimiy/bir martalik ulushi, kategoriyalar; oylik diagramma; kategoriya bo'yicha donut.
- Ro'yxat: nomi (+izoh), turi (doimiy — "to'xtatilgan" bo'lishi mumkin), kategoriya, davr (doimiy: boshlanish → tugash/davom etmoqda; bir martalik: sana), summa (doimiy — oyiga).
- Qo'shish/tahrirlash: tur tanlovi; nomi*, summa*, kategoriya, doimiy → boshlanish*, tugash, faol/to'xtatilgan; bir martalik → sana*; izoh. O'chirish — tasdiq bilan.
- Server bo'limni qo'llab-quvvatlamasa (404) — "hali yo'q" xabari.

**API:** `GET /expenses?expense_type&category&is_active&from_date&to_date&page&page_size`, `GET /expenses/summary?from_date&to_date`, `POST /expenses`, `PATCH /expenses/{id}`, `DELETE /expenses/{id}`.

**Ruxsat:** `finance:expenses:view`; o'zgartirish — `finance:expenses:edit`.

**Mobilda:** ro'yxat + "+" tugmasi; tur — segment; forma bitta ekran.

---

## 11. Hisobotlar
Tablar:

### 11.1 Dashboard
4 karta (bosiladigan): faol o'quvchilar → o'quvchilar; bugungi tushum → tranzaksiyalar (bugun); qarzdorlar soni + jami qarz → qarzdorlar tabi; bugungi sessiyalar → sessiyalar. **API:** `GET /reports/dashboard/summary`.

### 11.2 Analitika
Davr: 3 / 6 / 12 oy. KPI: MRR, shu oy yig'ilgani (rejadan %), o'quvchiga o'rtacha tushum, jami qarz (qarzdorlar soni). Diagrammalar: oylik tushum (oldingi davrga nisbatan %), to'lov manbalari (donut), manbalar bo'yicha oylik dinamika, kunlik tushum (30 kun), **tushum va xarajat** (sof foyda, rentabellik — xarajatlar bo'lsa), **reja va fakt**, qarz muddati (1/2/3/4+ oy), guruhlar bo'yicha qarz, eng katta qarzdorlar, yangi o'quvchilar / **o'quvchilar oqimi** (qo'shildi/ketdi), yosh taqsimoti, **davomat dinamikasi** (haftalar), guruhlar bo'yicha o'quvchilar (sig'im bilan), guruhlar davomati, oylik sessiyalar, to'lov yig'ilishi.
**API (yangi backend):** `GET /reports/revenue-dynamics?from_date&to_date&group_by=day|week|month`, `GET /reports/kpis`, `GET /reports/debt-aging`, `GET /reports/expected-vs-collected`, `GET /reports/students-dynamics`, `GET /reports/attendance/dynamics`, `GET /expenses/summary`. Bular bo'lmasa xom ro'yxatlardan hisoblanadi (`/transactions`, `/reports/debtors`, `/students`, `/contracts/stats`). Qalin belgilanganlar faqat yangi backendda.

**Mobilda:** har diagramma alohida karta, vertikal scroll; hover o'rniga bosib ushlash (tooltip); davr — segment.

### 11.3 Moliya hisoboti
Sana oralig'i; jami daromad, to'langan, jami qarz, muvaffaqiyatli tranzaksiyalar; manbalar bo'yicha jadval; oylar bo'yicha (bo'lsa). **API:** `GET /reports/finance?from_date&to_date`, `GET /transactions/transactionstatistics`, `GET /reports/terminated-summary`.

### 11.4 Davomat
Guruhlar bo'yicha: sessiyalar soni, o'quvchilar, davomat %. **API:** `GET /reports/attendance/groups?from_date&to_date`.

### 11.5 Qarzdorlar
Ro'yxat: o'quvchi, shartnoma · guruh · telefon, kechikkan oylar (chip), qarz summasi, necha oylik; Excel eksport. **API:** `GET /reports/debtors?group_id&min_debt_amount&year&month&page&page_size`, `GET /reports/debtors/export`.
**Mobilda:** telefonga bosib qo'ng'iroq/SMS — qarzdorlar bilan ishlash uchun asosiy amal.

### 11.6 To'lovchilar
Yil, oy, guruh filtri; ro'yxat: o'quvchi, shartnoma, guruh, to'langan oylar, jami; Excel. **API:** `GET /reports/payers?payment_year&payment_month&group_id&page&page_size`, `GET /reports/payers/export`.

**Ruxsat:** `finance:transactions:view` (hisobotlar menyusi), `reports:attendance:view` (davomat).

---

## 12. Kutish ro'yxati
**Vebda bor:** filtrlar (guruh, tug'ilgan yil); jadval: ism, tug'ilgan yil, ota-ona (ism, telefon), guruh, prioritet (0–100), izoh, qo'shilgan sana; qo'shish/tahrirlash (ism*, familiya*, tug'ilgan yil*, ota ismi/telefoni, ona ismi/telefoni, guruh, prioritet, izoh); o'chirish; **"Navbatdagi"** — guruh uchun navbatdagi nomzodni ko'rsatish.

**API:** `GET /waiting-list?group_id&birth_year&page&page_size`, `POST /waiting-list`, `PATCH /waiting-list/{id}`, `DELETE /waiting-list/{id}`, `GET /waiting-list/group/{gid}/next`.

**Ruxsat:** `students:view`.

---

## 13. Foydalanuvchilar va rollar
**Vebda bor:**
- **Foydalanuvchilar:** kartalar (ism, telefon/email, status, rollar, super admin belgisi, shaxsiy ruxsatlar soni); yaratish (F.I.O.*, telefon/email, parol*, status, super admin, rollar), tahrirlash (parolni almashtirish bilan), o'chirish, bir nechtasini o'chirish; **shaxsiy ruxsatlar** — rollardan kelganlar + qo'shimcha (kategoriya bo'yicha checkbox; texnik jihatdan `__user_<id>` nomli yashirin rol orqali saqlanadi).
- **Rollar:** ro'yxat (nomi, tavsif, ruxsatlar), yaratish/tahrirlash/o'chirish, ruxsatlarni kategoriya bo'yicha tanlash.

**API:** `GET /users`, `POST /users`, `PATCH /users/{id}`, `PATCH /users/{id}/roles`, `DELETE /users/{id}`, `POST /users/bulk-delete`, `GET /roles`, `GET /roles/permissions`, `POST /roles`, `PATCH /roles/{id}`, `DELETE /roles/{id}`.

**Ruxsat:** `users:manage`, `roles:manage`.

**Mobilda:** admin uchun; kam ishlatiladi — "Yana" bo'limida.

---

## 14. Audit log
**Vebda bor:** faoliyat tasmasi: vaqt, foydalanuvchi, amal (yaratish/yangilash/o'chirish/kirish/bekor/tugatish), ob'ekt turi va nomi; filtrlar: ob'ekt turi, amal, foydalanuvchi, sana oralig'i, qidiruv; yozuv tafsiloti (barcha maydonlar + qo'shimcha JSON).

**API:** `GET /audit-logs?entity_type&user_id&action&from_date&to_date&search&page&page_size`, `GET /users`.

**Ruxsat:** `settings:system:view`.

---

## 15. Sozlamalar
**Vebda bor (tablar):**
- **Umumiy:** valyuta, standart oylik to'lov, kechikish jarimasi %, hisobot kuni.
- **To'lov:** shu maydonlar (billing).
- **Integratsiya:** Click merchant id, Payme merchant id, SMS provider token.
- **Import:** o'quvchilarni Excel (.xlsx) orqali import qilish — ustunlar ro'yxati; natija (yaratildi/yangilandi/o'tkazib yuborildi/xatolar).
- **Zaxira:** backup holati, qo'lda backup (Telegramga yuboriladi).
- **Arxiv:** yil bo'yicha arxivlash / arxivdan chiqarish, statistika (faqat super admin).

**API:** `GET /settings/system`, `PATCH /settings/system`, `POST /import/students` (multipart), `GET /backup/status`, `POST /backup/manual`, `GET /archive/stats/{year}`, `POST /archive/year/{year}`, `POST /archive/unarchive/year/{year}`.

**Ruxsat:** `settings:system:view/edit`; arxiv — super admin.

**Mobilda:** faqat ko'rish + umumiy/to'lov maydonlarini tahrirlash; import va arxiv — mobilga kerak emas (faqat vebda).

---

## 16. Darvoza (turniket) loglari
Menyuda yashirilgan (kod bor, tugma o'chirilgan). Sana oralig'i (standart bugun), ruxsat/rad filtri; jadval: o'quvchi, vaqt, holat, sabab. **API:** `GET /gate/logs?from_date&to_date&student_id&allowed&page&page_size`. O'quvchi profilida ham "darvoza loglari" tabi bor, lekin o'chirilgan.

---

## 17. Yuqori panel (har ekranda)
- Til: UZ / RU (darhol almashadi, saqlanadi).
- Tema: yorug' / qorong'i; aksent rangi (8 ta variant).
- Foydalanuvchi menyusi: ism, rol; **rol almashtirish** (faqat super admin — boshqa rol ko'zi bilan ko'rish, serverga ta'sir qilmaydi); chiqish.

**Mobilda:** bularning hammasi "Yana" tabidagi profil ekranida; tema — tizim sozlamasiga ergashish varianti bilan.

---

## 18. Mobil ilovaga xos funksiyalar (vebda yo'q, qo'shish tavsiya etiladi)

| Funksiya | Nima kerak |
|----------|-----------|
| Face ID / Touch ID | Keychain'dagi refresh token bilan parolsiz kirish |
| Push-bildirishnoma | **Backendda yo'q** — kerak: `POST /devices` (APNs token ro'yxati) va hodisalar (yangi to'lov, sessiya boshlanishi, qarzdor eslatmasi). Hozircha faqat lokal eslatmalar (sessiya oldidan) |
| Oflayn | davomat belgilashni navbatga qo'yib, internet kelganda yuborish; oxirgi ro'yxatlarni kesh |
| Qo'ng'iroq / SMS | o'quvchi, ota-ona, qarzdor telefonlariga bir bosishda |
| Kamera | profil rasmi, pasport, chek, konspekt |
| Fayl ulashish | PDF shartnoma, Excel hisobotlar — Share sheet |
| Deep link | `alpha://students/{id}`, `alpha://sessions/{id}/attendance` — bildirishnomadan to'g'ri ekranga |
| Pull-to-refresh | barcha ro'yxatlar |

---

## 19. Backend holati (2026-09-20) — mobil jamoa bilishi kerak

Jonli API (`api.alpha.cognilabs.org`) da **hali deploy qilinmagan**, lekin kodi tayyor:
- prorated birinchi to'lov (`POST /students` da `initial_payment_*`, `TransactionRead.payment_type/period_*`);
- analitika aggregatlari (`/reports/revenue-dynamics`, `/kpis`, `/debt-aging`, `/expected-vs-collected`, `/students-dynamics`, `/attendance/dynamics`), `GroupRead.capacity`, `DashboardSummary.total_debt`, `TransactionRead.group_id`, `Student.status_changed_at`;
- xarajatlar (`/expenses`).

Frontend bularni **mavjudligini tekshirib** ishlatadi (yo'q bo'lsa eski usul). Mobil ilova ham shunday qilsin: `/openapi.json` ni bir marta o'qib, qaysi endpoint borligini aniqlash.

Ma'lum kamchiliklar:
- `GET /reports/finance` `source` maydoni `"PaymentSource.CASH"` ko'rinishida (tuzatish deploydan keyin) — hozircha `PaymentSource.` prefiksini kesib olish kerak.
- `/transactions` `page_size` maksimum 100.
- "Parolni unutdim" endpointi yo'q.
- Push uchun qurilma ro'yxati endpointi yo'q.
