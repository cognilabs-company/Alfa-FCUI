// @ts-nocheck
// Backend error messages are English (FastAPI `detail` strings); this maps
// every known message to uz/ru. Patterns are regexes so templated messages
// ("Group with ID 7 not found") keep their dynamic parts via $1/$2.
// Unknown messages pass through unchanged.

const RULES = [
  // Auth / session
  [/^Incorrect phone\/email or password$/i, "Telefon/email yoki parol noto'g'ri", 'Неверный телефон/email или пароль'],
  [/^Account is not active\. Please contact administrator\.$/i, 'Hisob faol emas. Administratorga murojaat qiling.', 'Аккаунт не активен. Обратитесь к администратору.'],
  [/^User account is not active$/i, 'Foydalanuvchi hisobi faol emas', 'Аккаунт пользователя не активен'],
  [/^Auth failed$/i, 'Avtorizatsiya amalga oshmadi', 'Ошибка авторизации'],
  [/^Invalid or expired refresh token$/i, "Sessiya muddati tugagan. Qaytadan kiring.", 'Сессия истекла. Войдите заново.'],
  [/^(Invalid token or token expired|Invalid token payload|Invalid user ID in token|Token missing user ID)$/i, "Sessiya yaroqsiz. Qaytadan kiring.", 'Сессия недействительна. Войдите заново.'],
  [/^Permission denied: (.+)$/i, "Ruxsat yo'q: $1", 'Нет доступа: $1'],
  [/^(Super admin access required|This operation requires super admin privileges)$/i, 'Bu amal uchun super admin huquqi kerak', 'Требуются права супер-админа'],
  [/^Only superusers can archive data$/i, 'Faqat super admin arxivlashi mumkin', 'Только супер-админ может архивировать'],
  [/^Only superusers can unarchive data$/i, 'Faqat super admin arxivdan chiqarishi mumkin', 'Только супер-админ может разархивировать'],
  [/^Only superusers can view archive stats$/i, "Arxiv statistikasini faqat super admin ko'ra oladi", 'Статистику архива видит только супер-админ'],

  // Users / roles
  [/^(Phone already registered|Phone number already registered)$/i, "Bu telefon raqam allaqachon ro'yxatdan o'tgan", 'Этот номер телефона уже зарегистрирован'],
  [/^(Email already registered|This email is already registered)$/i, "Bu email allaqachon ro'yxatdan o'tgan", 'Этот email уже зарегистрирован'],
  [/^Cannot delete super admin user$/i, "Super admin foydalanuvchini o'chirib bo'lmaydi", 'Нельзя удалить супер-админа'],
  [/^User not found$/i, 'Foydalanuvchi topilmadi', 'Пользователь не найден'],
  [/^Role not found$/i, 'Rol topilmadi', 'Роль не найдена'],
  [/^One or more role IDs are invalid$/i, "Bir yoki bir nechta rol ID noto'g'ri", 'Один или несколько ID ролей неверны'],
  [/^No user IDs provided$/i, 'Foydalanuvchilar tanlanmagan', 'Пользователи не выбраны'],

  // Students
  [/^Student not found$/i, "O'quvchi topilmadi", 'Ученик не найден'],
  [/^Student with ID (\d+) not found$/i, "ID $1 o'quvchi topilmadi", 'Ученик с ID $1 не найден'],
  [/^Student not found or not in your groups$/i, "O'quvchi topilmadi yoki sizning guruhlaringizda emas", 'Ученик не найден или не в ваших группах'],
  [/^Student not found for this contract$/i, "Bu shartnoma uchun o'quvchi topilmadi", 'Ученик по этому договору не найден'],
  [/^PNFL already exists\. Please use a unique PNFL$/i, "Bu PNFL allaqachon mavjud. Boshqa PNFL kiriting", 'Такой ПИНФЛ уже существует. Введите уникальный ПИНФЛ'],
  [/^Invalid student status: (.+)$/i, "O'quvchi statusi noto'g'ri: $1", 'Неверный статус ученика: $1'],
  [/^No student IDs provided$/i, "O'quvchilar tanlanmagan", 'Ученики не выбраны'],
  [/^At least one parent phone number \(father or mother\) is required$/i, "Kamida bitta ota-ona telefon raqami (ota yoki ona) kerak", 'Требуется хотя бы один номер телефона родителя (отца или матери)'],
  [/^Cannot change student's group\. Students cannot be transferred between groups\.$/i, "O'quvchi guruhini o'zgartirib bo'lmaydi.", 'Нельзя изменить группу ученика.'],
  [/^Student is already in group (\d+)\.?$/i, "O'quvchi allaqachon $1-guruhda.", 'Ученик уже в группе $1.'],
  [/^Invalid student_ids for this group: (.+)$/i, "Bu guruh uchun noto'g'ri o'quvchi IDlari: $1", 'Неверные ID учеников для этой группы: $1'],

  // Groups
  [/^Group not found$/i, 'Guruh topilmadi', 'Группа не найдена'],
  [/^Group (?:with ID )?(\d+) not found$/i, 'ID $1 guruh topilmadi', 'Группа с ID $1 не найдена'],
  [/^Group not found or has been deleted$/i, "Guruh topilmadi yoki o'chirilgan", 'Группа не найдена или удалена'],
  [/^New group not found or has been deleted$/i, "Yangi guruh topilmadi yoki o'chirilgan", 'Новая группа не найдена или удалена'],
  [/^Group not found or not assigned to you$/i, 'Guruh topilmadi yoki sizga biriktirilmagan', 'Группа не найдена или не закреплена за вами'],
  [/^Group\(s\) not found or deleted: (.+)$/i, "Guruh(lar) topilmadi yoki o'chirilgan: $1", 'Группа(ы) не найдены или удалены: $1'],
  [/^group_id must be a valid integer$/i, "Guruh ID raqam bo'lishi kerak", 'ID группы должен быть числом'],
  [/^No group IDs provided$/i, 'Guruh tanlanmagan', 'Группы не выбраны'],
  [/^No active students found for group (.+)$/i, "$1 guruhida faol o'quvchilar yo'q", 'В группе $1 нет активных учеников'],
  [/^Failed to create group: (.+)$/i, 'Guruh yaratilmadi: $1', 'Не удалось создать группу: $1'],
  [/^Failed to update group: (.+)$/i, 'Guruh yangilanmadi: $1', 'Не удалось обновить группу: $1'],
  [/^Coach with ID (\d+) not found$/i, 'ID $1 murabbiy topilmadi', 'Тренер с ID $1 не найден'],

  // Sessions / attendance
  [/^Session not found$/i, "Mashg'ulot topilmadi", 'Занятие не найдено'],
  [/^Session not found or group has been deleted$/i, "Mashg'ulot topilmadi yoki guruh o'chirilgan", 'Занятие не найдено или группа удалена'],
  [/^Session not found or you do not have permission to mark attendance$/i, "Mashg'ulot topilmadi yoki davomat belgilashga ruxsat yo'q", 'Занятие не найдено или нет права отмечать посещаемость'],
  [/^Session not found or you do not have permission to upload konspekt$/i, "Mashg'ulot topilmadi yoki konspekt yuklashga ruxsat yo'q", 'Занятие не найдено или нет права загружать конспект'],
  [/^Session not found or you do not have permission to view it$/i, "Mashg'ulot topilmadi yoki ko'rishga ruxsat yo'q", 'Занятие не найдено или нет права просматривать'],
  [/^Session ID mismatch$/i, "Mashg'ulot ID mos emas", 'Несовпадение ID занятия'],
  [/^No sessions provided$/i, "Mashg'ulotlar ko'rsatilmagan", 'Занятия не указаны'],
  [/^Bu dars uchun davomat allaqachon qilib bo'lingan\..*$/i, "Bu dars uchun davomat allaqachon qilib bo'lingan. Bir darsga faqat bir marta davomat qilish mumkin.", 'Посещаемость для этого занятия уже отмечена. Отмечать можно только один раз.'],

  // Performance table
  [/^Performance table not found for this season$/i, 'Bu mavsum uchun natijalar jadvali topilmadi', 'Таблица результатов для этого сезона не найдена'],
  [/^Column not found for this group$/i, 'Bu guruh uchun ustun topilmadi', 'Колонка для этой группы не найдена'],
  [/^Duplicate student_id in (?:column values|rows payload)$/i, "Takroriy o'quvchi ID yuborildi", 'Отправлен дублирующийся ID ученика'],
  [/^match_ids must exactly match the table's current columns$/i, 'Ustunlar jadvalning joriy ustunlariga mos kelishi kerak', 'Колонки должны совпадать с текущими колонками таблицы'],
  [/^Row for student_id (\d+) must have exactly (\d+) cells$/i, "ID $1 o'quvchi qatori $2 ta katakdan iborat bo'lishi kerak", 'Строка ученика с ID $1 должна содержать ровно $2 ячеек'],

  // Contracts
  [/^Contract not found$/i, 'Shartnoma topilmadi', 'Договор не найден'],
  [/^Contract is already terminated$/i, 'Shartnoma allaqachon bekor qilingan', 'Договор уже расторгнут'],
  [/^Could not generate unique terminated contract number$/i, "Bekor qilingan shartnoma raqamini yaratib bo'lmadi", 'Не удалось создать номер расторгнутого договора'],
  [/^PDF not generated for this contract$/i, 'Bu shartnoma uchun PDF yaratilmagan', 'PDF для этого договора не создан'],
  [/^PDF file not found: (.+)$/i, 'PDF fayl topilmadi: $1', 'PDF файл не найден: $1'],

  // Transactions
  [/^Transaction not found$/i, "To'lov topilmadi", 'Платёж не найден'],
  [/^No transaction IDs provided$/i, "To'lovlar tanlanmagan", 'Платежи не выбраны'],

  // Waiting list
  [/^Waiting list entry not found$/i, 'Navbat yozuvi topilmadi', 'Запись в списке ожидания не найдена'],

  // Files / uploads
  [/^Failed to upload file: (.+)$/i, 'Fayl yuklanmadi: $1', 'Не удалось загрузить файл: $1'],
  [/^Failed to upload proof file: (.+)$/i, 'Chek fayli yuklanmadi: $1', 'Не удалось загрузить файл чека: $1'],
  [/^File link expired$/i, 'Fayl havolasi muddati tugagan', 'Срок ссылки на файл истёк'],
  [/^Invalid file token$/i, "Fayl havolasi yaroqsiz", 'Ссылка на файл недействительна'],
  [/^File not found: (.+)$/i, 'Fayl topilmadi: $1', 'Файл не найден: $1'],
  [/^Invalid file type\. Allowed: (.+)$/i, "Fayl turi noto'g'ri. Ruxsat etilgan: $1", 'Неверный тип файла. Разрешены: $1'],
  [/^Only Excel files \(\.xlsx, \.xls\) are supported$/i, "Faqat Excel fayllar (.xlsx, .xls) qo'llab-quvvatlanadi", 'Поддерживаются только Excel файлы (.xlsx, .xls)'],
  [/^Error processing Excel file: (.+)$/i, 'Excel faylni qayta ishlashda xatolik: $1', 'Ошибка обработки Excel файла: $1'],
  [/^S3 service not configured\..*$/i, 'Fayl xizmati sozlanmagan. Administratorga murojaat qiling.', 'Файловый сервис не настроен. Обратитесь к администратору.'],

  // Archive / backup / settings
  [/^Backup failed: (.+)$/i, 'Zaxira nusxa olishda xatolik: $1', 'Ошибка резервного копирования: $1'],
  [/^Backup is disabled\..*$/i, "Zaxira nusxalash o'chirilgan. Sozlamalardan yoqing.", 'Резервное копирование отключено. Включите его в настройках.'],
  [/^Cannot archive future year (\d+)$/i, "Kelajakdagi $1-yilni arxivlab bo'lmaydi", 'Нельзя архивировать будущий $1 год'],
  [/^Invalid year (\d+)$/i, "Yil noto'g'ri: $1", 'Неверный год: $1'],
  [/^This endpoint has been removed$/i, "Bu funksiya o'chirilgan", 'Эта функция удалена'],

  // Dates / filters
  [/^At least one date field is required$/i, 'Kamida bitta sana maydoni kerak', 'Требуется хотя бы одно поле даты'],
  [/^from_date must be before or equal to to_date$/i, "Boshlanish sanasi tugash sanasidan kech bo'lmasligi kerak", 'Дата начала должна быть не позже даты окончания'],
  [/^Use either 'date' or 'from_date\/to_date' filters, not both$/i, 'Faqat bitta sana filtridan foydalaning', 'Используйте только один фильтр даты'],

  // Network / generic
  [/^Network Error$/i, "Internet aloqasi yo'q yoki server javob bermayapti", 'Нет соединения с сервером'],
  [/^Xatolik: (\d+)$/i, 'Xatolik: $1', 'Ошибка: $1'],
  [/^__network__$/, "Server bilan aloqa yo'q. Internet aloqasini tekshiring.", 'Нет связи с сервером. Проверьте интернет.'],
  [/^__validation__$/, "Ma'lumotlar noto'g'ri to'ldirilgan. Maydonlarni tekshiring.", 'Данные заполнены неверно. Проверьте поля.'],
];

function currentLang() {
  try { return localStorage.getItem('alpha_lang') || 'uz'; } catch { return 'uz'; }
}

export function translateApiError(message) {
  const msg = String(message ?? '').trim();
  if (!msg) return msg;
  const idx = currentLang() === 'ru' ? 2 : 1;
  for (const rule of RULES) {
    const m = msg.match(rule[0]);
    if (m) return rule[idx].replace(/\$(\d)/g, (_, n) => m[+n] ?? '');
  }
  return msg;
}
