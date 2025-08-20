import express from "express";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import dotenv from "dotenv";
import session from "express-session";

// تهيئة dotenv لقراءة متغيرات البيئة المحلية
dotenv.config();

// مسارات Node.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 📌 تسجيل المتغيرات البيئية عند بدء التشغيل
console.log("-----------------------------------------");
console.log("✅ Starting server and checking environment variables...");

const safeEnv = { ...process.env };
// إخفاء المتغيرات الحساسة
if (safeEnv.ADMIN_PASSWORD) safeEnv.ADMIN_PASSWORD = "***HIDDEN***";
if (safeEnv.SESSION_SECRET) safeEnv.SESSION_SECRET = "***HIDDEN***";
if (safeEnv.DATABASE_URL) safeEnv.DATABASE_URL = "***HIDDEN***";
// اطبع كل متغيرات البيئة
console.log("🚀 All Environment Variables from Railway:");
console.log(safeEnv);

// اطبع القيم المهمة وحدها
console.log(`ADMIN_USERNAME is: "${process.env.ADMIN_USERNAME || "Not set!"}"`);
console.log(`ADMIN_PASSWORD is: "${process.env.ADMIN_PASSWORD ? '***SET***' : 'Not set!'}"`);
console.log(`SESSION_SECRET is: "${process.env.SESSION_SECRET ? '***SET***' : 'Not set! Using default.'}"`);
console.log("-----------------------------------------");

// تهيئة تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware لخدمة الملفات الثابتة وتحليل البيانات المرسلة
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// إعداد الجلسات (Sessions)
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your_secret_key_here',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: process.env.NODE_ENV === 'production' }
    })
);

// -----------------------------------------
// 📌 التعديل هنا: استخدام DATABASE_URL فقط
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("❌ FATAL: DATABASE_URL environment variable is not set. Exiting.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
    keepAlive: true,
    idleTimeoutMillis: 30000,
});

// اختبار الاتصال بقاعدة البيانات عند بدء التشغيل
pool
    .query("SELECT 1")
    .then(() => console.log("✅ Database connected successfully!"))
    .catch((err) => console.error("❌ Database connection error:", err));

// مهم: عالج أي error عالـ pool عشان ما يكرش السيرفر
pool.on("error", (err) => {
    console.error("❌ Unexpected error on idle client", err);
});

// راوت الصفحة الرئيسية
app.get("/", (req, res) => {
    res.send(
        "<h1>Welcome to the Document Verification API!</h1><p>Please use a specific verification URL, e.g., /verify/your-token-here</p>"
    );
});

// راوت الواجهة الإدارية
app.get("/admin", (req, res) => {
    if (req.session.isAuthenticated) {
        console.log("✅ Admin access granted: Session is authenticated.");
        return res.sendFile(path.join(__dirname, "public", "admin.html"));
    }
    console.log("❌ Admin access denied: Not authenticated. Redirecting to login page.");
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// راوت جديد للتحقق من بيانات تسجيل الدخول
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    // 📌 تسجيل القيم التي تم استلامها من نموذج الدخول
    console.log("-----------------------------------------");
    console.log("🔎 Login attempt detected...");
    console.log(`Submitted username: "${username}"`);
    console.log(`Submitted password: "${password}"`);
    console.log("-----------------------------------------");

    // التحقق من البيانات باستخدام متغيرات Railway
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        // تسجيل الدخول بنجاح!
        req.session.isAuthenticated = true;
        console.log("✅ Login successful! Session created. Redirecting to /admin");
        // 📌 التعديل هنا: إعادة التوجيه مباشرة
        res.redirect('/admin');
    } else {
        console.log("❌ Invalid username or password entered.");
        res.status(401).send("Invalid username or password.");
    }
});

// راوت إضافة مستند جديد
app.post("/add-document", (req, res, next) => {
    if (req.session.isAuthenticated) {
        next();
    } else {
        console.log("❌ Unauthorized attempt to add document.");
        res.status(401).send("Unauthorized");
    }
}, async (req, res) => {
    const {
        doc_number,
        doc_type,
        party_one,
        party_two,
        status,
        issue_date,
        party_one_id,
        party_two_id,
        file_url,
    } = req.body;

    const verify_token = crypto.randomBytes(20).toString("hex").toUpperCase();

    try {
        const query =
            "INSERT INTO documents (doc_number, doc_type, party_one, party_two, status, issue_date, party_one_id, party_two_id, file_url, verify_token) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *";
        const result = await pool.query(query, [
            doc_number,
            doc_type,
            party_one,
            party_two,
            status,
            issue_date,
            party_one_id,
            party_two_id,
            file_url,
            verify_token,
        ]);
        console.log("✅ Document added successfully!");
        res.status(200).send(`Document added successfully! Token: ${verify_token}`);
    } catch (error) {
        console.error("❌ Error adding document:", error);
        res.status(500).send("An error occurred while adding the document.");
    }
});

// راوت التحقق
app.get("/verify/:token", async (req, res) => {
    const token = req.params.token;
    console.log("🔎 Received request for token:", token);

    try {
        const query = "SELECT * FROM documents WHERE verify_token = $1 LIMIT 1";
        const result = await pool.query(query, [token]);
        console.log("📦 Query result:", result.rows.length ? "Document found." : "Document not found.");

        if (result.rows.length === 0) {
            console.log("❌ Document not found. Redirecting to mol.gov.qa");
            return res.redirect("https://mol.gov.qa");
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
        html = html.replace(
            /{{issue_date}}/g,
            new Date(document.issue_date).toLocaleDateString("ar-EG")
        );
        html = html.replace(/{{file_url}}/g, document.file_url || "#");
        html = html.replace(/{{party_one_id}}/g, document.party_one_id || "-");
        html = html.replace(/{{party_two_id}}/g, document.party_two_id || "-");

        res.send(html);
        console.log("✅ Document data sent to client successfully.");
    } catch (err) {
        console.error("❌ Error fetching document:", err);
        res.status(500).send("<h1 style='color:red'>حدث خطأ في الاتصال</h1>");
    }
});

// تشغيل الخادم
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});