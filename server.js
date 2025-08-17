import express from "express";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// مسارات Node.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تهيئة تطبيق Express
const app = express();
// استخدام متغير البيئة للمنفذ، أو 3000 كقيمة افتراضية
const PORT = process.env.PORT || 3000;

// خدمة الملفات الثابتة من مجلد 'public'
// هذا السطر سيتعامل مع ملف 'verify.html' تلقائيًا
app.use(express.static(path.join(__dirname, "public")));

// 📌 الاتصال بقاعدة البيانات عبر متغير بيئة
// إذا لم يكن متغير البيئة موجودًا، استخدم سلسلة الاتصال المباشرة كاحتياطي
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_T1CqDrVcwA3m@ep-still-sky-a2bmknia-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

// اختبار الاتصال بقاعدة البيانات عند بدء التشغيل
pool.connect()
  .then(() => console.log("✅ Database connected successfully!"))
  .catch((err) => console.error("❌ Database connection error:", err));

// 📌 راوت الصفحة الرئيسية
app.get("/", (req, res) => {
  res.send("<h1>Welcome to the Document Verification API!</h1><p>Please use a specific verification URL, e.g., /verify/your-token-here</p>");
});

// 📌 راوت التحقق
app.get("/verify/:token", async (req, res) => {
  const token = req.params.token;
  console.log("🔎 Received request for token:", token);

  try {
    const query = "SELECT * FROM documents WHERE verify_token = $1 LIMIT 1";
    const result = await pool.query(query, [token]);
    console.log("📦 Query result:", result.rows);

    if (result.rows.length === 0) {
      return res.send("<h1 style='color:red'>المستند غير موجود</h1>");
    }

    const document = result.rows[0];
    const htmlPath = path.join(__dirname, "public", "verify.html");
    let html = fs.readFileSync(htmlPath, "utf8");

    // 📝 استبدال البيانات
    html = html.replace(/{{doc_number}}/g, document.doc_number || "-");
    html = html.replace(/{{doc_type}}/g, document.doc_type || "-");
    html = html.replace(/{{party_one}}/g, document.party_one || "-");
    html = html.replace(/{{party_two}}/g, document.party_two || "-");
    html = html.replace(/{{status}}/g, document.status || "-");
    html = html.replace(/{{issue_date}}/g, new Date(document.issue_date).toLocaleDateString("ar-EG"));
    html = html.replace(/{{file_url}}/g, document.file_url || "#");
    html = html.replace(/{{party_one_id}}/g, document.party_one_id || "-");
    html = html.replace(/{{party_two_id}}/g, document.party_two_id || "-");

    res.send(html);
  } catch (err) {
    console.error("❌ Error fetching document:", err);
    res.status(500).send("<h1 style='color:red'>حدث خطأ في الاتصال</h1>");
  }
});

// تشغيل الخادم
// الاستماع على '0.0.0.0' ضروري لبيئات الاستضافة مثل Railway
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
