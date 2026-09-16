# Prorated (birinchi qisqa) to'lov va avtomatik shartnoma — bajarilgan ishlar

**Sana:** 2026-09-16
**Maqsad:** O'quvchi oy o'rtasida qo'shilganda birinchi qisqa muddatli to'lovni standart oylik to'lovdan **alohida** boshqarish; birinchi davr tugaganda shartnomani **avtomatik** yaratish.

---

## 1. Umumiy oqim

```
15.09  O'quvchi qo'shiladi (prorated rejim)
       → Student yaratiladi (ACTIVE)
       → INITIAL to'lov: amount=150 000 (admin erkin), davr 15.09 → 01.10
       → Shartnoma HALI yo'q. Customer/monthly_fee ma'lumotlari `contract_draft`da saqlanadi.

01.10  Scheduler (kunlik, 00:05 Tashkent) ishga tushadi
       → period_end_date <= bugun va shartnomasi yo'q INITIAL to'lovlarni topadi
       → Shartnomani avtomatik yaratadi (start=01.10, monthly_fee=300 000)
       → INITIAL to'lovni shartnomaga bog'laydi

01.10+ Standart oylik tizim: 300 000 so'm, 01.10 → 01.11, keyingi oylar shu tartibda.
```

Birinchi "qisqa davr" to'lovi va standart oylik to'lovlar **bir-biridan alohida** saqlanadi (`payment_type`).

---

## 2. O'zgartirilgan fayllar

| Fayl | O'zgarish |
|------|-----------|
| `app/models/enums.py` | Yangi `PaymentType` enum: `INITIAL` / `MONTHLY` |
| `app/models/finance.py` | `Transaction`ga 4 ustun: `payment_type`, `period_start_date`, `period_end_date`, `contract_draft` (JSON) |
| `app/schemas/transaction.py` | `TransactionRead`ga yangi maydonlar + `InitialPaymentPayload` |
| `app/schemas/student.py` | `StudentCreateResult.contract` → optional, `initial_payment` qo'shildi |
| `app/services/payment.py` | `create_initial_payment()` (summa **erkin**, tekshiruvsiz); monthly to'lovga `payment_type=MONTHLY` + davr sanalari |
| `app/services/contracts.py` | `process_due_initial_periods()` — davri tugagan INITIAL to'lovlar uchun shartnomani avtomatik yaratadi + bog'laydi (idempotent) |
| `app/routers/students.py` | `POST /students`ga optional prorated rejim |
| `main.py` | Kunlik scheduler job (00:05) + startup'da bir marta ishlaydi |
| `alembic/versions/20260916_01_add_prorated_payment_fields.py` | Yangi ustunlar migratsiyasi |

---

## 3. Ma'lumotlar modeli (talab #4)

Har bir `Transaction` endi quyidagilarni saqlaydi:

| Maydon | Izoh |
|--------|------|
| `amount` | To'lov summasi |
| `paid_at` | To'lov qilingan sana |
| `period_start_date` | Amal qilish boshlanishi |
| `period_end_date` | Amal qilish tugashi (shartnoma shu sanada avtomatik yaratiladi) |
| `payment_type` | `INITIAL` (birinchi/prorated) yoki `MONTHLY` (oddiy oylik) |
| `contract_draft` | INITIAL uchun: kechiktirilgan shartnoma ma'lumotlari (customer, monthly_fee) |

**Misol:**
```
Payment #1 (INITIAL): amount=150000, paid_at=15.09.2026, 15.09 → 01.10
Payment #2 (MONTHLY): amount=300000,                     01.10 → 01.11
```

---

## 4. API — `POST /students` (optional prorated rejim)

Mavjud oqim **buzilmaydi**. Yangi optional form maydonlari:

| Maydon | Majburiy? | Izoh |
|--------|-----------|------|
| `initial_payment_amount` | Yo'q | **Berilsa → prorated rejim.** Admin erkin summa. |
| `initial_payment_start_date` | Yo'q | Standart: bugun (qo'shilgan sana) |
| `initial_payment_end_date` | Amount berilsa — **ha** | Standart oylik shu kundan boshlanadi |
| `initial_payment_source` | Yo'q | Standart: `cash` |
| `initial_payment_paid_at` | Yo'q | To'lov vaqti |
| `initial_payment_comment` | Yo'q | Izoh |

- `initial_payment_amount` **berilmasa** → hozirgidek darrov shartnoma yaratiladi.
- Berilsa → shartnoma yaratilMAYDI, `initial_payment` javobda qaytadi, `contract` = `null`.

Validatsiya: `amount > 0`, `end_date > start_date`, amount berilsa `end_date` majburiy (aks holda `422`).

---

## 5. Muhim operatsion eslatmalar

1. **Migratsiya (production DB):** ilova `create_all` ishlatadi — u mavjud jadvalga ustun **qo'shmaydi**. Shuning uchun deploydan oldin:
   ```bash
   alembic upgrade head
   ```
   Migratsiya mavjud qatorlarni `payment_type='MONTHLY'` bilan backfill qiladi (eski to'lovlar oddiy oylik hisoblanadi).

2. **Scheduler:** endi **har doim** ishga tushadi (ilgari faqat `BACKUP_ENABLED` bo'lganda). Kunlik `due_initial_periods` job 00:05 (Asia/Tashkent) da ishlaydi + startup'da bir marta (ilova o'chiq turgan davrda tugagan davrlar uchun).

3. **Frontend:** ✅ bajarildi — 7-bo'limga qarang.

4. **Idempotentlik:** scheduler qayta ishlasa dublikat shartnoma yaratmaydi; xatolar har bir o'quvchi bo'yicha izolyatsiya qilingan (bittasi buzilsa qolganlari davom etadi).

---

## 6. Test natijalari (haqiqiy ma'lumotlarga umuman ta'sir qilmasdan)

Test **izolyatsiyalangan bir martalik Postgres 16 konteynerida** o'tkazildi (prod DB/S3'ga umuman tegilmadi; S3/PDF chaqiruvlari mock qilindi; konteyner test oxirida o'chirildi).

**Funksional oqim — 21/21 tekshiruv o'tdi:**
- ✅ INITIAL to'lov: erkin summa (150 000), shartnomasiz, davr sanalari, `contract_draft` saqlangan
- ✅ Scheduler davr tugashidan **oldin** (30.09) — hech narsa yaratmaydi
- ✅ Scheduler davr tugaganda (01.10) — shartnoma avtomatik yaratildi (start=01.10, fee=300 000), to'lov bog'landi
- ✅ Idempotentlik — qayta ishlaganда dublikat yo'q, bitta shartnoma
- ✅ Standart MONTHLY to'lov — `payment_type=MONTHLY`, davr 01.10 → 01.11
- ✅ Eski qoida saqlangan — noto'g'ri oylik summa rad etiladi (`ValueError`)

**Migratsiya (real Postgres'da):**
- ✅ 4 ustun qo'shildi (to'g'ri turlar bilan)
- ✅ Eski qator `MONTHLY` ga backfill qilindi
- ✅ Ikkala indeks yaratildi, `server_default` tozalandi
- ✅ `alembic downgrade base` — ustunlar toza o'chirildi (to'liq qaytariladigan)

**Statik tekshiruv:** barcha o'zgargan fayllar kompilyatsiya + import bo'ldi.

> ⚠️ Eslatma: test faithful Postgres'da o'tdi, ammo haqiqiy S3 va PDF generatsiyasi mock qilingan (haqiqiy servisga tegmaslik uchun). Deploydan keyin staging'da bitta real prorated ro'yxatdan o'tkazish tavsiya etiladi.

---

## 7. Frontend (Alfa-FCUI) — bajarilgan ishlar

**Sana:** 2026-09-16

| Fayl | O'zgarish |
|------|-----------|
| `src/shared/api/students.ts` | `apiSupportsProratedPayment()` — `/openapi.json` orqali server bu funksiyani qo'llab-quvvatlashini tekshiradi (sessiyaga bir marta, `sessionStorage`da keshlanadi) |
| `src/pages/students/student-new.tsx` | 2-qadamda "Birinchi qisqa to'lov" tugmachasi + maydonlar; `contract=null` bo'lgan javob uchun alohida yakuniy oyna |
| `src/pages/students/student-profile.tsx` | To'lovlar jadvalida `INITIAL` belgisi; shartnoma yo'q bo'lsa "shartnoma {sana}da avtomatik yaratiladi" ogohlantirishi |
| `src/pages/transactions/index.tsx` | Ro'yxatda `INITIAL` belgisi; tafsilot oynasida "To'lov turi" va "To'lov davri" |
| `src/shared/styles/index.css` | `.opt-card` + `.switch` (tugmacha) uslublari |
| `src/shared/i18n/lang.tsx` | 19 ta yangi kalit (UZ + RU) |

**Xatti-harakati:**

1. **Xavfsizlik chorasi:** eski backend qo'shimcha form maydonlarini indamay tashlab yuboradi va shartnomani darrov yaratadi. Shuning uchun frontend avval `/openapi.json`dan `initial_payment_amount` borligini tekshiradi. Yo'q bo'lsa — tugmacha **o'chirilgan** holatda, izohi bilan ko'rinadi ("Server bu funksiyani hali qo'llab-quvvatlamaydi").
2. Tugmacha yoqilganda: summa (majburiy), manba (naqd/Payme/Click/bank), davr boshlanishi (standart — bugun), davr tugashi (standart — keyingi oyning 1-kuni), to'lov vaqti, izoh.
3. `contract_start_date` avtomatik `initial_payment_end_date` ga tenglashtiriladi — shartnoma qisqa davr tugagan kuni boshlanadi. Shartnoma boshlanish sanasi maydoni bu rejimda yashiriladi.
4. Validatsiya (serverga yuborishdan oldin): `amount > 0`, `end_date > start_date`.
5. Javobda `initial_payment` qaytsa — yakuniy oynada summa, davr va "shartnoma {sana}da avtomatik yaratiladi" yoziladi, PDF tugmasi ko'rsatilmaydi. Agar prorated so'ralgani holda `initial_payment` qaytmasa — sariq ogohlantirish chiqadi.

**Test natijalari:**
- Mock backend bilan to'liq oqim (UZ va RU): 12/12 tekshiruv o'tdi — POST tanasida `initial_payment_*` maydonlari, `contract_start_date` davr tugashiga teng va bir marta yuborilishi, yakuniy oyna matni.
- Eski (qo'llab-quvvatlamaydigan) backend: tugmacha o'chirilgan holatda — 2/2 o'tdi.
- Haqiqiy API (faqat o'qish): probe `GET /api/openapi.json 200`, tugmacha o'chiq, natija keshlangan, ikkinchi kirishda qayta so'ralmadi — 5/5 o'tdi.
- Eski regression to'plami (18 ta tekshiruv) va `vite build` — o'tdi.

> Backend deploy qilinganidan keyin frontendda hech narsa o'zgartirish shart emas: probe yangi sxemani ko'radi va tugmacha o'zi yoqiladi (foydalanuvchi sahifani yangilagach yoki yangi sessiyada).
