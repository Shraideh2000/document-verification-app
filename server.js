import express from "express";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import dotenv from "dotenv";
import session from "express-session"; // 📌 إضافة مكتبة الجلسات

// تهيئة dotenv لقراءة متغيرات البيئة المحلية
dotenv.config();

// مسارات Node.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تهيئة تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware لخدمة الملفات الثابتة وتحليل البيانات المرسلة
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// 📌 إعداد الجلسات (Sessions)
// يجب أن تكون القيمة (secret) سرية ومعقدة. استخدم أي سلسلة نصية طويلة
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your_secret_key_here',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: process.env.NODE_ENV === 'production' } // secure: true في الإنتاج
    })
);

// 📌 الاتصال بقاعدة البيانات عبر متغير بيئة
const connectionString =
    process.env.DATABASE_URL ||
    "postgresql://neondb_owner:npg_T1CqDrVcwA3m@ep-still-sky-a2bmknia-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

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

// 📌 راوت الصفحة الرئيسية
app.get("/", (req, res) => {
    res.send(
        "<h1>Welcome to the Document Verification API!</h1><p>Please use a specific verification URL, e.g., /verify/your-token-here</p>"
    );
});

// 📌 راوت الواجهة الإدارية
// الآن سيعيد توجيه المستخدم إلى صفحة الإدارة الفعلية إذا كان مسجل دخول
app.get("/admin", (req, res) => {
    if (req.session.isAuthenticated) {
        return res.sendFile(path.join(__dirname, "public", "admin.html"));
    }
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// 📌 راوت جديد للتحقق من بيانات تسجيل الدخول
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    // التحقق من البيانات باستخدام متغيرات Railway
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        // 📌 تسجيل الدخول بنجاح!
        req.session.isAuthenticated = true; // نضع متغيرًا في الجلسة
        res.status(200).send("Login successful!");
    } else {
        res.status(401).send("Invalid username or password.");
    }
});

// 📌 راوت إضافة مستند جديد
// تمت إضافة middleware للتحقق من الجلسة
app.post("/add-document", (req, res, next) => {
    if (req.session.isAuthenticated) {
        next(); // إذا كان مسجل دخول، اكمل للراوت
    } else {
        res.status(401).send("Unauthorized"); // وإلا، ارجع خطأ
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

// 📌 راوت التحقق
app.get("/verify/:token", async (req, res) => {
    const token = req.params.token;
    console.log("🔎 Received request for token:", token);

    try {
        const query = "SELECT * FROM documents WHERE verify_token = $1 LIMIT 1";
        const result = await pool.query(query, [token]);
        console.log("📦 Query result:", result.rows);

        if (result.rows.length === 0) {
            console.log("❌ Document not found. Redirecting to example.com");
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
    } catch (err) {
        console.error("❌ Error fetching document:", err);
        res.status(500).send("<h1 style='color:red'>حدث خطأ في الاتصال</h1>");
    }
});

// تشغيل الخادم
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});