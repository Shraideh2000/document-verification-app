import express from "express";
import { Pool } from "pg";

const app = express();
const PORT = process.env.PORT || 3000;

// Pool بسيط للاتصال بقاعدة البيانات
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // يحل مشاكل SSL غالبًا
});

// Route اختبار الاتصال
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ DB connected:", result.rows[0]);
    res.send(`<h1>Database connected successfully!</h1><p>${JSON.stringify(result.rows[0])}</p>`);
  } catch (err) {
    console.error("❌ DB connection error:", err);
    res.status(500).send("<h1>Database connection failed!</h1><pre>" + err.message + "</pre>");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Test server running on port ${PORT}`);
});
