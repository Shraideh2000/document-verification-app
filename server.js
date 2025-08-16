import express from "express";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// import dotenv from "dotenv";

// dotenv.config();
// مسارات Node.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تهيئة تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// خدمة الملفات الثابتة من مجلد 'public'
app.use(express.static(path.join(__dirname, "public")));

// الاتصال بقاعدة البيانات عبر متغير بيئة
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
    ssl: true
});

// اختبار الاتصال بقاعدة البيانات
pool.connect()
  .then(() => console.log("✅ Database connected successfully!"))
  .catch((err) => console.error("❌ Database connection error:", err));

// 📌 مسار الصفحة الرئيسية
// هذا المسار سيعرض صفحة 'verify.html' عندما يفتح المستخدم رابط التطبيق
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "verify.html"));
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
