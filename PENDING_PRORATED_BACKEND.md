# Birinchi qisqa to'lov — hujjat kutayotgan o'quvchi uchun

## Nima o'zgardi

"Birinchi qisqa to'lov" (prorated first payment) **`POST /students`** dan olib tashlanib,
**`POST /students/pending-documents`** ga ko'chirildi.

Sababi: o'quvchi oy o'rtasida keladi va birinchi (qisqa) to'lovni darrov to'laydi, lekin
hujjatlari hali yo'q. Shu sabab o'sha paytda `POST /students` qilib bo'lmaydi — faqat
pending yozuv yaratiladi. To'lov esa o'sha yerda qabul qilinishi kerak.

Frontend tayyor. Hozir `PendingStudentCreate` sxemasida `initial_payment_amount` yo'q,
shuning uchun interfeys bu switchni **o'chirilgan** holda ko'rsatadi
("Server bu funksiyani hali qo'llab-quvvatlamaydi"). Backend qo'shilgan zahoti switch
o'zi yoqiladi — frontendda hech narsa o'zgartirish shart emas
(`/openapi.json` dagi `components.schemas.PendingStudentCreate.properties`
bo'yicha tekshiriladi).

## 1. `POST /students/pending-documents`

`PendingStudentCreate` ga quyidagi **ixtiyoriy** maydonlar qo'shilsin:

| Field | Type | Required | Izoh |
|---|---|---|---|
| `initial_payment_amount` | number | no | > 0 bo'lsa, qisqa to'lov qabul qilinadi |
| `initial_payment_start_date` | date | no | davr boshlanishi, default — bugun |
| `initial_payment_end_date` | date | no | davr tugashi, `start_date` dan keyin |
| `initial_payment_source` | string | no | `cash` \| `payme` \| `click` \| `bank`, default `cash` |
| `initial_payment_paid_at` | datetime | no | to'lov vaqti, default — hozir |
| `initial_payment_comment` | string | no | izoh |

Frontend yuboradigan JSON (aynan shunday):

```json
{
  "first_name": "Doston",
  "last_name": "Rustamov",
  "phone": "+998901112233",
  "date_of_birth": "2016-04-02",
  "document_due_date": "2026-10-06",
  "note": "Metrikasini olib keladi",
  "initial_payment_amount": 175000,
  "initial_payment_start_date": "2026-09-25",
  "initial_payment_end_date": "2026-10-01",
  "initial_payment_source": "cash",
  "initial_payment_paid_at": "2026-09-25T14:30",
  "initial_payment_comment": ""
}
```

`initial_payment_amount` yuborilmasa — hozirgi xatti-harakat o'zgarmaydi.

### Validatsiya

```text
initial_payment_amount  > 0
initial_payment_end_date > initial_payment_start_date
```

Xato bo'lsa `422`.

### Nima qilish kerak

1. Pending yozuv yaratilsin (hozirgidek).
2. `initial_payment_amount` berilgan bo'lsa — **tranzaksiya yaratilsin**:
   - summa, manba, to'lov vaqti, izoh — yuborilgani bo'yicha
   - `payment_type` — `INITIAL` (oddiy oylik to'lovlardan ajratish uchun)
   - shartnoma hali yo'q, shuning uchun tranzaksiya pending yozuvga bog'lansin
     (`pending_student_id`)
3. Davr sanalari pending yozuvda saqlansin — `complete` da kerak bo'ladi.

## 2. `PendingStudentRead` — qaytariladigan maydonlar

Ro'yxatda "bu bolaning birinchi to'lovi qabul qilingan" ekanini ko'rsatish uchun:

| Field | Type | Izoh |
|---|---|---|
| `initial_payment_amount` | number \| null | |
| `initial_payment_start_date` | date \| null | |
| `initial_payment_end_date` | date \| null | |
| `initial_payment_source` | string \| null | |
| `initial_payment_paid_at` | datetime \| null | |
| `initial_payment_transaction_id` | number \| null | yaratilgan tranzaksiya |

## 3. `POST /students/pending-documents/{id}/complete`

Hujjatlar kelganda shartnoma yaratiladi. Agar pending yozuvda qisqa to'lov bo'lsa:

- `contract_start_date` — **`initial_payment_end_date`** bo'lsin
  (qisqa davr tugagan kundan oylik shartnoma boshlanadi).
- Frontend `contract_start_date` yuborsa ham, qisqa to'lov bor bo'lganda server
  `initial_payment_end_date` ni ustun qo'ysin — yoki hech bo'lmasa, frontend
  yubormaganda shuni ishlatsin.
- Qisqa to'lov tranzaksiyasi yangi yaratilgan o'quvchi va shartnomaga
  qayta bog'lansin (`pending_student_id` → `student_id` + `contract_id`),
  toki to'lov hisobotlarda ko'rinsin.

`complete` ning qolgan maydonlari o'zgarmaydi.

## 4. Eski endpoint

`POST /students` dagi `initial_payment_*` maydonlari endi frontenddan
**yuborilmaydi**. Backendda qoldirilsa ham zarari yo'q (boshqa mijozlar ishlatishi
mumkin), lekin ular endi ishlatilmaydi.

## 5. Xulosa — tartib

```text
1. Bola keldi, hujjati yo'q
   → POST /students/pending-documents  (+ initial_payment_*)
   → pending yozuv + tranzaksiya (INITIAL)

2. Hujjat keldi
   → POST /students/pending-documents/{id}/complete
   → Student + Contract (start_date = initial_payment_end_date)
   → tranzaksiya student/contract ga bog'lanadi
```
