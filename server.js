import express from "express";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDoc, doc, query, where, getDocs } from "firebase/firestore";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

// مسارات Node.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تهيئة تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware لتحميل الملفات (تم إبقاؤه لمتطلبات multer، لكن لن يتم استخدامه)
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// 📌 إعدادات Firebase - يجب إضافتها في Railway
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  // تمت إزالة storageBucket
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// تهيئة Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
// تمت إزالة storage
console.log("✅ Firebase services initialized successfully.");

// 📌 راوت الصفحة الرئيسية
app.get("/", (req, res) => {
    res.send("<h1>Welcome to the Document Verification API!</h1><p>Please use a specific verification URL, e.g., /verify/your-token-here</p>");
});

// 📌 راوت الواجهة الإدارية
app.get("/admin", (req, res) => {
    const adminPath = path.join(__dirname, "public", "admin.html");
    res.sendFile(adminPath);
});

// 📌 راوت التحقق
app.get("/verify/:token", async (req, res) => {
    const token = req.params.token;
    console.log("🔎 Received request for token:", token);

    try {
        const uppercaseToken = token.toUpperCase();
        
        const documentsRef = collection(db, "documents");
        const q = query(documentsRef, where("verify_token", "==", uppercaseToken));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return res.status(404).send("<h1 style='color:red'>المستند غير موجود</h1>");
        }

        const document = querySnapshot.docs[0].data();
        const htmlPath = path.join(__dirname, "public", "verify.html");
        let html = fs.readFileSync(htmlPath, "utf8");

        html = html.replace(/{{doc_number}}/g, document.doc_number || "-");
        html = html.replace(/{{doc_type}}/g, document.doc_type || "-");
        html = html.replace(/{{party_one}}/g, document.party_one || "-");
        html = html.replace(/{{party_two}}/g, document.party_two || "-");
        html = html.replace(/{{status}}/g, document.status || "-");
        html = html.replace(/{{issue_date}}/g, new Date(document.issue_date).toLocaleDateString("ar-EG"));
        // تم تغيير file_url إلى قيمة ثابتة
        html = html.replace(/{{file_url}}/g, "لا يوجد ملف مرفق"); 
        html = html.replace(/{{party_one_id}}/g, document.party_one_id || "-");
        html = html.replace(/{{party_two_id}}/g, document.party_two_id || "-");
        html = html.replace(/{{verify_token}}/g, document.verify_token || "-");

        res.send(html);
    } catch (err) {
        console.error("❌ Error fetching document:", err);
        res.status(500).send("<h1 style='color:red'>حدث خطأ في الاتصال</h1>");
    }
});

// 📌 راوت إضافة مستند جديد
// تمت إزالة 'upload.single' لأنه لم يعد هناك ملف
app.post("/add-document", async (req, res) => {
    const { doc_number, doc_type, party_one, party_two, status, issue_date, party_one_id, party_two_id } = req.body;

    // تم إزالة فحص الملف
    
    let verify_token = crypto.randomBytes(20).toString('hex').toUpperCase();

    try {
        // تم إزالة عملية رفع الملف إلى Firebase Storage

        // 💾 تخزين البيانات في Firestore مع فحص القيمة
        const docData = {
            doc_number: doc_number ? doc_number.trim() : '',
            doc_type: doc_type ? doc_type.trim() : '',
            party_one: party_one ? party_one.trim() : '',
            party_two: party_two ? party_two.trim() : '',
            status: status ? status.trim() : '',
            issue_date: issue_date ? issue_date.trim() : '',
            file_url: "لا يوجد ملف مرفق", // قيمة ثابتة
            party_one_id: party_one_id ? party_one_id.trim() : '',
            party_two_id: party_two_id ? party_two_id.trim() : '',
            verify_token
        };

        await addDoc(collection(db, "documents"), docData);
        
        console.log("✅ Document added successfully!");
        res.status(200).send(`Document added successfully! Token: ${verify_token}`);

    } catch (error) {
        console.error("❌ Error adding document:", error);
        res.status(500).send("An error occurred while adding the document.");
    }
});

// تشغيل الخادم
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
