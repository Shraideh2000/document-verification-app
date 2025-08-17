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
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// 📌 الاتصال بقاعدة البيانات عبر متغير بيئة (أكثر أمانًا)
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_T1CqDrVcwA3m@ep-still-sky-a2bmknia-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

let pool;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // 2 seconds

// 🎯 دالة الاتصال بقاعدة البيانات مع آلية إعادة المحاولة
async function connectToDatabase() {
    try {
        console.log("🟡 Attempting to connect to the database...");
        pool = new Pool({
            connectionString: connectionString,
            ssl: { rejectUnauthorized: false },
        });

        await pool.connect();
        console.log("✅ Database connected successfully!");
    } catch (err) {
        console.error(`❌ Initial database connection error: ${err.message}`);
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            const delay = RETRY_DELAY * retryCount;
            console.log(`⏱️ Retrying connection in ${delay / 1000} seconds... (Attempt ${retryCount}/${MAX_RETRIES})`);
            setTimeout(connectToDatabase, delay);
        } else {
            console.error("⛔ Max retries reached. Exiting application.");
            // يمكنك هنا إرسال إشعار أو تسجيل خطأ حرج
            process.exit(1); // إغلاق التطبيق إذا فشل الاتصال تمامًا
        }
    }
}

// البدء بالاتصال عند تشغيل الخادم
connectToDatabase();

// 📌 راوت الصفحة الرئيسية
app.get("/", (req, res) => {
    res.send("<h1>Welcome to the Document Verification API!</h1><p>Please use a specific verification URL, e.g., /verify/your-token-here</p>");
});

// 📌 راوت التحقق
app.get("/verify/:token", async (req, res) => {
    // تحقق من وجود الاتصال قبل محاولة الاستعلام
    if (!pool) {
        console.log("⚠️ No database connection. Returning service unavailable.");
        return res.status(503).send("<h1 style='color:orange'>الخدمة غير متوفرة حالياً، يرجى المحاولة لاحقاً.</h1>");
    }

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
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
