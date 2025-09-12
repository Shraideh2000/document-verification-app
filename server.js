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
if (safeEnv.ADMIN_PASSWORD) safeEnv.ADMIN_PASSWORD = "***HIDDEN***";
if (safeEnv.SESSION_SECRET) safeEnv.SESSION_SECRET = "***HIDDEN***";
if (safeEnv.DATABASE_URL) safeEnv.DATABASE_URL = "***HIDDEN***";
console.log("🚀 All Environment Variables from Railway:");
console.log(safeEnv);
console.log(`ADMIN_USERNAME is: "${process.env.ADMIN_USERNAME || "Not set!"}"`);
console.log(`ADMIN_PASSWORD is: "${process.env.ADMIN_PASSWORD ? '***SET***' : 'Not set!'}"`);
console.log(`SESSION_SECRET is: "${process.env.SESSION_SECRET ? '***SET***' : 'Not set! Using default.'}"`);
console.log("-----------------------------------------");

// تهيئة تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your_secret_key_here',
        resave: false,
        saveUninitialized: true,
        cookie: {
            secure: true,
            sameSite: 'lax'
        }
    })
);

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

pool.query("SELECT 1")
    .then(() => console.log("✅ Database connected successfully!"))
    .catch((err) => console.error("❌ Database connection error:", err));
pool.on("error", (err) => {
    console.error("❌ Unexpected error on idle client", err);
});

// -----------------------------------------
// الراوتات العامة
// -----------------------------------------
app.get("/", (req, res) => {
    console.log("Redirecting from root path to another domain...");
    // Replace 'https://your-other-domain.com' with the actual URL you want to redirect to
    res.redirect("https://www.mol.gov.qa"); 
});

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
        html = html.replace(/{{doc_number}}/g, document.doc_number || "-");
        html = html.replace(/{{doc_type}}/g, document.doc_type || "-");
        html = html.replace(/{{party_one}}/g, document.party_one || "-");
        html = html.replace(/{{party_two}}/g, document.party_two || "-");
        html = html.replace(/{{status}}/g, document.status || "-");
        html = html.replace(
            /{{issue_date}}/g,
            document.issue_date ? new Date(document.issue_date).toLocaleDateString("ar-EG") : "-"
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

// -----------------------------------------
// الراوتات الخاصة بالإدارة (Admin)
// -----------------------------------------
app.get("/admin", (req, res) => {
    if (req.session.isAuthenticated) {
        console.log("✅ Admin access granted: Session is authenticated.");
        return res.sendFile(path.join(__dirname, "public", "admin.html"));
    }
    console.log("❌ Admin access denied: Not authenticated. Redirecting to login page.");
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// راوت جديد لصفحة البحث (Admin only)
app.get("/search", (req, res) => {
    if (req.session.isAuthenticated) {
        console.log("✅ Search page access granted: Session is authenticated.");
        return res.sendFile(path.join(__dirname, "public", "search.html"));
    }
    console.log("❌ Unauthorized access to search page.");
    res.status(401).send("Unauthorized");
});

// راوت جديد لمعالجة طلب البحث (Admin only)
app.post("/api/search-documents", async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const { query } = req.body;
    try {
        let sqlQuery = "SELECT * FROM documents";
        const queryParams = [];
        if (query && query.trim() !== "") {
            const searchQuery = `%${query.trim()}%`;
            sqlQuery += ` WHERE 
                          doc_number ILIKE $1 OR
                          doc_type ILIKE $1 OR
                          party_one ILIKE $1 OR
                          party_two ILIKE $1 OR
                          status ILIKE $1 OR
                          CAST(issue_date AS TEXT) ILIKE $1`;
            queryParams.push(searchQuery);
        }
        sqlQuery += " ORDER BY doc_number ASC";
        const result = await pool.query(sqlQuery, queryParams);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("❌ Error searching documents:", error);
        res.status(500).json({ message: "An error occurred during search." });
    }
});

app.get("/api/get-document/:doc_number", async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const { doc_number } = req.params;
    try {
        const result = await pool.query('SELECT * FROM documents WHERE doc_number = $1', [doc_number]);
        if (result.rows.length > 0) {
            res.json({ message: 'Document found.', data: result.rows[0] });
        } else {
            res.status(404).json({ message: 'Document not found.' });
        }
    } catch (error) {
        console.error("❌ Error fetching document:", error);
        res.status(500).json({ message: "An error occurred while fetching the document." });
    }
});

app.delete("/api/delete-document/:doc_number", async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const { doc_number } = req.params;
    try {
        const result = await pool.query("DELETE FROM documents WHERE doc_number = $1 RETURNING *", [doc_number]);
        if (result.rows.length > 0) {
            res.json({ message: "Document deleted successfully." });
        } else {
            res.status(404).json({ message: "Document not found." });
        }
    } catch (error) {
        console.error("❌ Error deleting document:", error);
        res.status(500).json({ message: "An error occurred while deleting the document." });
    }
});


app.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        res.status(200).send("Login successful!");
    } else {
        res.status(401).send("Invalid username or password.");
    }
});

app.post("/add-document", (req, res, next) => {
    if (req.session.isAuthenticated) {
        next();
    } else {
        res.status(401).send("Unauthorized");
    }
}, async (req, res) => {
    const { doc_number, doc_type, party_one, party_two, status, issue_date, party_one_id, party_two_id, file_url } = req.body;

    try {
        if (doc_number && doc_number.trim() !== "") {
            console.log(`🔎 Updating document with doc_number: ${doc_number}`);
            const oldDocResult = await pool.query('SELECT * FROM documents WHERE doc_number = $1', [doc_number]);
            if (oldDocResult.rows.length === 0) {
                return res.status(404).send("Document not found. No records updated.");
            }
            const oldDocData = oldDocResult.rows[0];
            
            const updateFields = {
                doc_type: doc_type || oldDocData.doc_type,
                party_one: party_one || oldDocData.party_one,
                party_two: party_two || oldDocData.party_two,
                status: status || oldDocData.status,
                issue_date: issue_date || oldDocData.issue_date,
                party_one_id: party_one_id || oldDocData.party_one_id,
                party_two_id: party_two_id || oldDocData.party_two_id,
                file_url: file_url || oldDocData.file_url
            };

            const updateQuery = `
                UPDATE documents 
                SET doc_type = $1, party_one = $2, party_two = $3, status = $4, issue_date = $5, party_one_id = $6, party_two_id = $7, file_url = $8
                WHERE doc_number = $9
                RETURNING *;
            `;
            const result = await pool.query(updateQuery, [
                updateFields.doc_type, 
                updateFields.party_one, 
                updateFields.party_two, 
                updateFields.status,
                updateFields.issue_date, 
                String(updateFields.party_one_id), 
                String(updateFields.party_two_id), 
                updateFields.file_url, 
                doc_number
            ]);
            if (result.rows.length > 0) {
                console.log("✅ Document updated successfully!");
                res.status(200).send("Document updated successfully!");
            } else {
                res.status(404).send("Document not found for update.");
            }
        } else {
            console.log("🔎 Adding a new document.");
            const lastDocQuery = "SELECT doc_number FROM documents WHERE doc_number LIKE 'E937028538-43-%' ORDER BY id DESC LIMIT 1";
            const lastDocResult = await pool.query(lastDocQuery);
            let lastNumber = 0;
            if (lastDocResult.rows.length > 0) {
                const lastDocNumberStr = lastDocResult.rows[0].doc_number;
                const parts = lastDocNumberStr.split('-');
                if (parts.length > 2) { 
                    lastNumber = parseInt(parts[2], 10);
                }
            }
            const newNumber = lastNumber + 1;
            const formattedNumber = String(newNumber).padStart(3, '0');
            const new_doc_number = `E937028538-43-${formattedNumber}`;
            const verify_token = crypto.randomBytes(20).toString("hex").toUpperCase();
            const insertQuery = "INSERT INTO documents (doc_number, doc_type, party_one, party_two, status, issue_date, party_one_id, party_two_id, file_url, verify_token) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *";
            await pool.query(insertQuery, [
                new_doc_number, 
                doc_type, 
                party_one, 
                party_two, 
                status, 
                issue_date, 
                String(party_one_id), 
                String(party_two_id), 
                file_url, 
                verify_token
            ]);
            res.status(200).send(`Document added successfully! Document Number: ${new_doc_number}, Token: ${verify_token}`);
        }
    } catch (error) {
        console.error("❌ Error adding/updating document:", error);
        res.status(500).send("An error occurred while processing the document.");
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});