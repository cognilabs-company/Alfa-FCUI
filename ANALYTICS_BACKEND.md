# Analitika uchun backend talablari

**Sana:** 2026-09-16
**Kim uchun:** backend dasturchi
**Nima uchun:** Bosh sahifadagi va Hisobotlar → **Analitika** bo'limidagi diagrammalar uchun. Frontend tayyor va **hozir ham ishlayapti** — lekin ma'lumotni xom ro'yxatlardan o'zi yig'yapti. Quyidagilar shuni tartibga soladi va bir nechta yo'q ma'lumotni qo'shadi.

---

## 1. Hozir frontend nima qilyapti

Analitika ochilganda quyidagi so'rovlar ketadi (barchasi mavjud endpointlar):

| So'rov | Nima uchun | Muammo |
|--------|-----------|--------|
| `GET /transactions?from_date&to_date&page_size=100` × 2–12 sahifa | tushum dinamikasi, manbalar, o'rtacha to'lov | `page_size` maksimum **100** → to'lovlar ko'paygan sari sahifalar soni ortadi |
| `GET /reports/debtors?page_size=100` × 1–6 sahifa | qarz muddati, guruh bo'yicha qarz, top qarzdorlar | 212 ta qarzdor = 3 so'rov; faqat summa kerak bo'lsa ham hamma qatorlar tortiladi |
| `GET /students?page_size=500&include_archived=true` | yangi o'quvchilar dinamikasi, yosh taqsimoti | 210 qator har safar; ketganlar sanasi yo'q |
| `GET /groups`, `GET /reports/attendance/groups`, `GET /head-coach/sessions`, `GET /contracts/stats`, `GET /reports/dashboard/summary` | qolgan kartochkalar | — |

Ya'ni bitta sahifa uchun **8–11 ta so'rov** va ~200–1500 qator. Bugungi hajmda normal, lekin bir yildan keyin sekinlashadi.

---

## 2. Kerakli endpointlar (muhimlik tartibida)

### 2.1 `GET /reports/revenue-dynamics` — tushum dinamikasi

> Eslatma: frontendda bu endpoint uchun funksiya **allaqachon yozilgan** (`apiGetReportsRevenueDynamics`), lekin server 404 qaytaradi.

```
GET /reports/revenue-dynamics?group_by=month&from_date=2026-04-01&to_date=2026-09-16&group_id=9
```
`group_by`: `day` | `week` | `month` (majburiy emas, default `month`)

```json
{ "data": [
  { "period": "2026-08", "from_date": "2026-08-01", "to_date": "2026-08-31",
    "total_amount": 22500000, "transaction_count": 45,
    "by_source": [ { "source": "cash", "amount": 15000000, "transaction_count": 30 },
                   { "source": "click", "amount": 7500000, "transaction_count": 15 } ] }
] }
```

Talablar:
- Faqat **muvaffaqiyatli** (`success`/`settled`) to'lovlar.
- Sana sifatida `paid_at` (yo'q bo'lsa `created_at`).
- Bo'sh davrlar ham qaytsin (`total_amount: 0`) — diagrammada uzilish bo'lmasligi uchun.
- `source` — **enum qiymati** (`cash`), Python enum repr emas (3.1-bandga qarang).

### 2.2 `GET /reports/kpis` — bitta so'rovda asosiy ko'rsatkichlar

```
GET /reports/kpis?from_date=2026-04-01&to_date=2026-09-16
```
```json
{ "data": {
  "mrr": 65902000,                    // faol shartnomalar oylik summasi
  "collected_this_month": 23100000,
  "collection_rate": 0.35,            // collected_this_month / mrr
  "arpu": 65667,                      // davr uchun o'rtacha: tushum / oy / faol o'quvchi
  "avg_payment": 450000,
  "paying_students": 119,             // davrda kamida bitta to'lov qilganlar
  "active_students": 150,
  "new_students_this_month": 12,
  "left_students_this_month": 3,      // 2.5 bandsiz hisoblab bo'lmaydi
  "total_debt": 151216000,
  "debtors_count": 212
} }
```

### 2.3 `GET /reports/debt-aging` — qarz muddati bo'yicha

```json
{ "data": {
  "total_debt": 151216000,
  "buckets": [
    { "months_overdue": 1, "students": 54, "amount": 16200000 },
    { "months_overdue": 2, "students": 67, "amount": 40200000 },
    { "months_overdue": 3, "students": 52, "amount": 49200000 },
    { "months_overdue": "4+", "students": 39, "amount": 45616000 }
  ],
  "by_group": [ { "group_id": 9, "group_name": "Alpha Kids", "students": 22, "amount": 36000000 } ],
  "top_debtors": [ { "student_id": 137, "student_name": "…", "debt_amount": 1500000, "overdue_months_count": 3 } ]
} }
```
(`top_debtors` — 10 ta yetarli.)

### 2.4 `GET /reports/expected-vs-collected` — reja va fakt

Eng muhim moliyaviy ko'rsatkich: har oy **qancha kutilgan** va **qancha yig'ilgan**.

```
GET /reports/expected-vs-collected?from_date=2026-01-01&to_date=2026-09-30
```
```json
{ "data": [
  { "period": "2026-08", "expected": 65902000, "collected": 22500000, "collection_rate": 0.34, "debt_added": 43402000 }
] }
```
`expected` — o'sha oyda amal qilgan shartnomalarning oylik to'lovlari yig'indisi (oy o'rtasida qo'shilganlar uchun prorated summa hisobga olinsa yanada yaxshi — `PRORATED_PAYMENT_FEATURE.md` ga qarang).

### 2.5 `GET /reports/students-dynamics` — o'quvchilar oqimi (churn)

```json
{ "data": [
  { "period": "2026-08", "joined": 12, "left": 3, "active_at_end": 150 }
] }
```

**Hozir buni hisoblab bo'lmaydi:** `StudentRead` da faqat `created_at` bor, status qachon o'zgargani saqlanmaydi. Kerak:
- `status_changed_at` (yoki `left_at`) maydoni `Student` jadvalida;
- yoki status o'zgarishlari tarixi (audit-logda bor, lekin hisobot uchun ishonchli emas).

Bu bo'lmasa: "necha o'quvchi ketdi", "qancha vaqt qoladi (retention)", "churn %" — hech qaysisi ko'rsatib bo'lmaydi.

### 2.6 `GET /reports/attendance/dynamics` — davomat dinamikasi

```
GET /reports/attendance/dynamics?group_by=week&from_date=…&to_date=…&group_id=…
```
```json
{ "data": [ { "period": "2026-W36", "sessions": 8, "present": 142, "late": 6, "absent": 12, "attendance_rate": 0.89 } ] }
```
Hozir faqat `/reports/attendance/groups` bor — u davr bo'yicha **bitta** o'rtacha foiz beradi, dinamika yo'q.

---

## 3. Mavjud endpointlardagi kamchiliklar

### 3.1 `GET /reports/finance` — `source` noto'g'ri formatda 🐞

Haqiqiy javob:
```json
"breakdown": [ { "source": "PaymentSource.CASH", "total_amount": 20400000, "transaction_count": 68 } ]
```
Bo'lishi kerak: `"source": "cash"`. Hozir `str(enum)` ishlatilgan, `enum.value` emas. Frontend buni vaqtincha tuzatib ko'rsatyapti, lekin manbada to'g'rilash kerak.

### 3.2 `GroupRead` da `capacity` yo'q

Bosh sahifadagi "guruh to'ldirilishi" progressi hozir **25** degan qat'iy sonni ishlatyapti (`DEFAULT_CAPACITY`), chunki API guruh sig'imini qaytarmaydi. Kerak: `capacity` (yoki `max_students`) maydoni `GroupRead` ichida.

### 3.3 `DashboardSummary` da `total_debt` yo'q

`/reports/dashboard/summary` faqat `total_debtors` beradi, umumiy qarz summasi yo'q. Bosh sahifada "jami qarz" shuning uchun ko'rsatilmayapti. `total_debt` qo'shilsa — bitta so'rov bilan chiqadi.

### 3.4 `page_size` chegaralari har xil

`/students` → 500 gacha, `/transactions` → **100** (200 so'rasa `422`). Analitika uchun yo aggregat endpointlar (2-bo'lim), yoki `/transactions` uchun ham 500 ga ruxsat kerak.

### 3.5 `TransactionRead` da `group_id` yo'q

Tushumni guruh bo'yicha ajratish uchun har bir to'lovni o'quvchi → guruh bo'yicha bog'lash kerak (frontendda qimmat). `group_id` (yoki `student_group_id`) qo'shilsa, "guruh bo'yicha tushum" diagrammasi ham chiqadi.

### 3.6 `/reports/payments-by-source` — 404

Frontendda funksiya bor (`apiGetReportsPaymentsBySource`), serverda endpoint yo'q. 2.1 bandidagi `by_source` uni qoplaydi — u holda bu funksiyani frontenddan o'chirsak ham bo'ladi.

---

## 4. Frontend nima qiladi bular tayyor bo'lganda

- `revenue-dynamics`, `debt-aging`, `kpis`, `expected-vs-collected` chiqishi bilan — o'sha endpointlarga o'tiladi, xom ro'yxatlarni tortish to'xtaydi (8–11 so'rov → 2–3 so'rov).
- `students-dynamics` va `attendance/dynamics` chiqsa — churn/retention va davomat trendi diagrammalari qo'shiladi (hozir umuman yo'q).
- `capacity` chiqsa — bosh sahifadagi qat'iy 25 olib tashlanadi.

Frontend tomonida hech narsa buzilmaydi: endpoint yo'q bo'lsa, hozirgi hisoblash usuli ishlayveradi.

---

## 4.1 Holat (2026-09-16, frontend tomonidan)

Backend tomonidan barchasi bajarilgan (`ANALYTICS_BACKEND_IMPLEMENTED.md`), lekin **hali deploy qilinmagan** — `api.alpha.cognilabs.org/openapi.json` da yangi endpointlar va maydonlar yo'q.

Frontend ikkala holatga ham tayyor:

| Server | Frontend nima qiladi |
|--------|---------------------|
| Yangi (endpointlar bor) | `revenue-dynamics`, `kpis`, `debt-aging`, `expected-vs-collected`, `students-dynamics`, `attendance/dynamics` ishlatiladi. Xom `/transactions` va `/reports/debtors` **umuman tortilmaydi**. Qo'shimcha 3 ta diagramma chiqadi: "Reja va fakt", "O'quvchilar oqimi" (joined/left), "Davomat dinamikasi". Guruh sig'imi (`capacity`) va `total_debt` ham ishlatiladi. |
| Eski (hozirgi) | Avvalgidek xom ro'yxatlardan hisoblanadi. Yangi 3 ta diagramma ko'rsatilmaydi (ma'lumot yo'q). |

Tekshiruv: endpointlar bo'lmasa sessiyaga **2 ta** so'rov ketadi, keyin natija eslab qolinadi (5 daqiqada bir qayta tekshiriladi) — deploy qilinganidan keyin sahifa o'zi yangi endpointlarga o'tadi, hech narsa qilish shart emas.

---

## 5. Qisqacha ro'yxat

| # | Ish | Muhimlik |
|---|-----|----------|
| 1 | `/reports/finance` dagi `PaymentSource.CASH` bug'i | 🔴 yuqori (1 qatorlik tuzatish) |
| 2 | `GET /reports/revenue-dynamics` | 🔴 yuqori |
| 3 | `GET /reports/debt-aging` | 🔴 yuqori |
| 4 | `GET /reports/kpis` | 🟡 o'rta |
| 5 | `GET /reports/expected-vs-collected` | 🟡 o'rta |
| 6 | `GroupRead.capacity` | 🟡 o'rta |
| 7 | `DashboardSummary.total_debt` | 🟡 o'rta |
| 8 | `Student.status_changed_at` + `GET /reports/students-dynamics` | 🟢 keyingi bosqich |
| 9 | `GET /reports/attendance/dynamics` | 🟢 keyingi bosqich |
| 10 | `TransactionRead.group_id`, `/transactions` uchun `page_size=500` | 🟢 keyingi bosqich |
