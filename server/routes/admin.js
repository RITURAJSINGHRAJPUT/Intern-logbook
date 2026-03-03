const express = require("express");
const router = express.Router();
const { db, auth } = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");
const { verifyAdmin } = require("../middleware/adminAuth");
const fs = require("fs");
const path = require("path");

const TEMPLATES_DIR = path.join(__dirname, "../../pdf-format");

// All admin routes require auth + admin role
router.use(verifyToken);
router.use(verifyAdmin);

/**
 * GET /api/admin/stats
 * Dashboard statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const usersSnapshot = await db.collection("users").get();
    let total = 0,
      approved = 0,
      pending = 0;

    usersSnapshot.forEach((doc) => {
      total++;
      const data = doc.data();
      if (data.approved) {
        approved++;
      } else {
        pending++;
      }
    });

    res.json({ total, approved, pending });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/**
 * GET /api/admin/users
 * List all users with pagination, search, and filter
 * Query params: page, limit, search, filter (all|approved|pending)
 */
router.get("/users", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = (req.query.search || "").toLowerCase();
    const filter = req.query.filter || "all";

    let query = db.collection("users").orderBy("createdAt", "desc");
    const snapshot = await query.get();

    let users = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      users.push({
        uid: doc.id,
        email: data.email || "",
        role: data.role || "student",
        approved: data.approved || false,
        active: data.active !== false, // default true
        allowBulkFill: data.allowBulkFill || false,
        bulkCredits: data.bulkCredits || 0,
        allowedTemplates: data.allowedTemplates || [],
        createdAt: data.createdAt
          ? data.createdAt.toDate().toISOString()
          : null,
        lastLogin: data.lastLogin
          ? data.lastLogin.toDate().toISOString()
          : null,
        displayName: data.displayName || "",
      });
    });

    // Apply search filter
    if (search) {
      users = users.filter(
        (u) =>
          u.email.toLowerCase().includes(search) ||
          u.displayName.toLowerCase().includes(search),
      );
    }

    // Apply status filter
    if (filter === "approved") {
      users = users.filter((u) => u.approved);
    } else if (filter === "pending") {
      users = users.filter((u) => !u.approved);
    }

    const totalFiltered = users.length;
    const totalPages = Math.ceil(totalFiltered / limit);
    const startIndex = (page - 1) * limit;
    const paginatedUsers = users.slice(startIndex, startIndex + limit);

    res.json({
      users: paginatedUsers,
      pagination: {
        page,
        limit,
        totalPages,
        totalUsers: totalFiltered,
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

/**
 * POST /api/admin/users/:uid/approve
 */
router.post("/users/:uid/approve", async (req, res) => {
  try {
    const { uid } = req.params;
    await db.collection("users").doc(uid).update({
      approved: true,
    });
    console.log(`✅ User ${uid} approved by admin ${req.user.uid}`);
    res.json({ success: true, message: "User approved" });
  } catch (error) {
    console.error("Error approving user:", error);
    res.status(500).json({ error: "Failed to approve user" });
  }
});

/**
 * DELETE /api/admin/users/:uid
 */
router.delete("/users/:uid", async (req, res) => {
  try {
    const { uid } = req.params;

    // 0. Fetch user to add to banned list BEFORE deleting
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists && userDoc.data().email) {
      await db.collection("banned_users").doc(userDoc.data().email).set({
        bannedAt: new Date(),
        bannedBy: req.user.uid,
      });
    }

    // 1. Delete from Firebase Authentication
    await auth.deleteUser(uid).catch((err) => {
      console.warn(
        `Auth deletion failed for ${uid} (maybe already deleted):`,
        err.message,
      );
    });

    // 2. Delete the user document from Firestore
    await db.collection("users").doc(uid).delete();

    console.log(`🗑️ User ${uid} permanently deleted by admin ${req.user.uid}`);
    res.json({ success: true, message: "User deleted permanently" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

/**
 * POST /api/admin/users/:uid/reject
 * Keep for backward compatibility, same logic as DELETE now
 */
router.post("/users/:uid/reject", async (req, res) => {
  try {
    const { uid } = req.params;
    await auth.deleteUser(uid).catch(() => {});
    await db.collection("users").doc(uid).delete();
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

/**
 * POST /api/admin/users/:uid/toggle-active
 */
router.post("/users/:uid/toggle-active", async (req, res) => {
  try {
    const { uid } = req.params;
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentActive = userDoc.data().active !== false;
    await db.collection("users").doc(uid).update({
      active: !currentActive,
    });

    console.log(
      `🔄 User ${uid} toggled to ${!currentActive ? "active" : "inactive"} by admin ${req.user.uid}`,
    );
    res.json({ success: true, active: !currentActive });
  } catch (error) {
    console.error("Error toggling user:", error);
    res.status(500).json({ error: "Failed to toggle user status" });
  }
});

/**
 * POST /api/admin/users/:uid/toggle-bulk
 */
router.post("/users/:uid/toggle-bulk", async (req, res) => {
  try {
    const { uid } = req.params;
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentBulkFill = userDoc.data().allowBulkFill || false;
    await db.collection("users").doc(uid).update({
      allowBulkFill: !currentBulkFill,
    });

    console.log(
      `🗃️ User ${uid} bulk fill access toggled to ${!currentBulkFill} by admin ${req.user.uid}`,
    );
    res.json({ success: true, allowBulkFill: !currentBulkFill });
  } catch (error) {
    console.error("Error toggling bulk fill access:", error);
    res.status(500).json({ error: "Failed to toggle bulk fill access" });
  }
});

/**
 * PUT /api/admin/users/:uid/templates
 * Update allowed templates for a user
 * Body: { allowedTemplates: ["template1.pdf", "template2.pdf"] }
 */
router.put("/users/:uid/templates", async (req, res) => {
  try {
    const { uid } = req.params;
    const { allowedTemplates } = req.body;

    if (!Array.isArray(allowedTemplates)) {
      return res
        .status(400)
        .json({ error: "allowedTemplates must be an array" });
    }

    await db.collection("users").doc(uid).update({
      allowedTemplates: allowedTemplates,
    });

    console.log(
      `📄 Templates updated for user ${uid} by admin ${req.user.uid}:`,
      allowedTemplates,
    );
    res.json({ success: true, allowedTemplates });
  } catch (error) {
    console.error("Error updating templates:", error);
    res.status(500).json({ error: "Failed to update templates" });
  }
});

/**
 * PUT /api/admin/users/:uid/credits
 * Update bulk fill credits for a user
 * Body: { bulkCredits: 100 }
 */
router.put("/users/:uid/credits", async (req, res) => {
  try {
    const { uid } = req.params;
    const { bulkCredits } = req.body;

    if (typeof bulkCredits !== "number" || bulkCredits < 0) {
      return res
        .status(400)
        .json({ error: "bulkCredits must be a positive number" });
    }

    await db.collection("users").doc(uid).update({
      bulkCredits: bulkCredits,
    });

    console.log(
      `🪙 Credits updated to ${bulkCredits} for user ${uid} by admin ${req.user.uid}`,
    );
    res.json({ success: true, bulkCredits });
  } catch (error) {
    console.error("Error updating credits:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to update credits" });
  }
});

/**
 * GET /api/admin/templates
 * List all available template files (for admin template assignment UI)
 */
router.get("/templates", (req, res) => {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      return res.json({ templates: [] });
    }

    const templates = fs
      .readdirSync(TEMPLATES_DIR)
      .filter((file) => file.toLowerCase().endsWith(".pdf"))
      .map((file) => ({
        filename: file,
        name: file.replace(".pdf", ""),
      }));

    res.json({ templates });
  } catch (error) {
    console.error("Error listing templates:", error);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

/**
 * POST /api/admin/templates/upload
 * Upload a new global template
 */
const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    }
    cb(null, TEMPLATES_DIR);
  },
  filename: (req, file, cb) => {
    // use original name but ensure it's a pdf
    let filename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    if (!filename.toLowerCase().endsWith(".pdf")) {
      filename += ".pdf";
    }
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

router.post("/templates/upload", upload.single("template"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No template file uploaded" });
    }

    console.log(
      `📄 New template uploaded by admin ${req.user.uid}: ${req.file.filename}`,
    );
    res.json({
      success: true,
      template: {
        filename: req.file.filename,
        name: req.file.filename.replace(".pdf", ""),
      },
    });
  } catch (error) {
    console.error("Error uploading template:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to upload template" });
  }
});

/**
 * DELETE /api/admin/templates/:filename
 * Delete a global template and its associated fields
 */
router.delete("/templates/:filename", (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename.endsWith(".pdf")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const pdfPath = path.join(TEMPLATES_DIR, filename);
    const fieldsPath = path.join(
      TEMPLATES_DIR,
      filename.replace(".pdf", ".fields.json"),
    );

    let deleted = false;

    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
      deleted = true;
    }

    if (fs.existsSync(fieldsPath)) {
      fs.unlinkSync(fieldsPath);
    }

    if (deleted) {
      console.log(`🗑️ Template deleted by admin ${req.user.uid}: ${filename}`);
      res.json({ success: true, message: "Template deleted" });
    } else {
      res.status(404).json({ error: "Template not found" });
    }
  } catch (error) {
    console.error("Error deleting template:", error);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

/**
 * POST /api/admin/templates/:filename/fields
 * Save global fields for a template
 */
router.post("/templates/:filename/fields", (req, res) => {
  try {
    const { filename } = req.params;
    const { fields } = req.body;

    if (!filename || !filename.endsWith(".pdf")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    if (!fs.existsSync(TEMPLATES_DIR)) {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    }

    const fieldsFile = filename.replace(".pdf", ".fields.json");
    const globalFieldsPath = path.join(TEMPLATES_DIR, fieldsFile);

    const fieldsData = {
      templateName: filename,
      updatedBy: req.user.uid,
      savedAt: new Date().toISOString(),
      isGlobal: true,
      fields: fields || [],
    };

    fs.writeFileSync(globalFieldsPath, JSON.stringify(fieldsData, null, 2));

    console.log(
      `✅ Global template fields saved by admin ${req.user.uid}: ${fieldsFile}`,
    );
    res.json({ success: true, message: "Global fields saved successfully" });
  } catch (error) {
    console.error("Error saving global template fields:", error);
    res.status(500).json({ error: "Failed to save global template fields" });
  }
});

/**
 * GET /api/admin/payments
 * Fetch all pending payment requests
 */
router.get("/payments", async (req, res) => {
  try {
    const snapshot = await db
      .collection("paymentRequests")
      .where("status", "==", "pending")
      .get(); // Sorting in memory to avoid needing a Firestore composite index

    let payments = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      payments.push({
        id: doc.id,
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
        transactionId: data.transactionId,
        screenshotFilename: data.screenshotFilename,
        status: data.status,
        createdAt: data.createdAt
          ? data.createdAt.toDate().toISOString()
          : null,
      });
    });

    // Sort in memory by descending createdAt
    payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ payments });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Failed to fetch payment requests" });
  }
});

/**
 * GET /api/admin/payments/history
 * Fetch all resolved payment requests (approved/rejected)
 */
router.get("/payments/history", async (req, res) => {
  try {
    const snapshotApproved = await db
      .collection("paymentRequests")
      .where("status", "==", "approved")
      .get();
    const snapshotRejected = await db
      .collection("paymentRequests")
      .where("status", "==", "rejected")
      .get();

    let payments = [];
    const processDoc = (doc) => {
      const data = doc.data();
      payments.push({
        id: doc.id,
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
        transactionId: data.transactionId,
        screenshotFilename: data.screenshotFilename,
        status: data.status,
        creditsGranted: data.creditsGranted || 0,
        createdAt: data.createdAt
          ? data.createdAt.toDate().toISOString()
          : null,
        resolvedAt: data.approvedAt
          ? data.approvedAt.toDate().toISOString()
          : data.rejectedAt
            ? data.rejectedAt.toDate().toISOString()
            : null,
        resolvedBy: data.approvedBy || data.rejectedBy || null,
      });
    };

    snapshotApproved.forEach(processDoc);
    snapshotRejected.forEach(processDoc);

    // Sort in memory by descending createdAt
    payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ payments });
  } catch (error) {
    console.error("Error fetching payment history:", error);
    res.status(500).json({ error: "Failed to fetch payment history" });
  }
});

/**
 * POST /api/admin/payments/:id/approve
 * Approve a payment and grant custom credits
 */
router.post("/payments/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const requestedCredits = parseInt(req.body.credits, 10);
    const creditsToGrant =
      !isNaN(requestedCredits) && requestedCredits > 0 ? requestedCredits : 150;

    const paymentDoc = await db.collection("paymentRequests").doc(id).get();

    if (!paymentDoc.exists) {
      return res.status(404).json({ error: "Payment request not found" });
    }

    const paymentData = paymentDoc.data();
    if (paymentData.status !== "pending") {
      return res.status(400).json({ error: "Payment is not pending" });
    }

    // Add custom bulkCredits to user
    const userRef = db.collection("users").doc(paymentData.uid);
    const userDoc = await userRef.get();
    let currentCredits = 0;
    if (userDoc.exists && userDoc.data().bulkCredits) {
      currentCredits = userDoc.data().bulkCredits;
    }

    const newCredits = currentCredits + creditsToGrant;

    await db.runTransaction(async (transaction) => {
      transaction.update(userRef, { bulkCredits: newCredits });
      transaction.update(paymentDoc.ref, {
        status: "approved",
        approvedBy: req.user.uid,
        approvedAt: new Date(),
        creditsGranted: creditsToGrant,
      });
    });

    console.log(
      `✅ Payment ${id} approved by admin ${req.user.uid}. User ${paymentData.uid} received ${creditsToGrant} credits.`,
    );
    res.json({ success: true, message: "Payment approved", newCredits });
  } catch (error) {
    console.error("Error approving payment:", error);
    res.status(500).json({ error: "Failed to approve payment" });
  }
});

/**
 * POST /api/admin/payments/:id/reject
 * Reject a payment
 */
router.post("/payments/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    await db.collection("paymentRequests").doc(id).update({
      status: "rejected",
      rejectedBy: req.user.uid,
      rejectedAt: new Date(),
    });

    console.log(`❌ Payment ${id} rejected by admin ${req.user.uid}`);
    res.json({ success: true, message: "Payment rejected" });
  } catch (error) {
    console.error("Error rejecting payment:", error);
    res.status(500).json({ error: "Failed to reject payment" });
  }
});

/**
 * POST /api/admin/setup-first-admin
 * One-time setup: creates admin doc for the authenticated user.
 * Only works if zero admins exist in the collection.
 */
// We need a special route WITHOUT verifyAdmin for first-time setup
// So we create a separate router
const setupRouter = express.Router();
setupRouter.use(verifyToken);

setupRouter.post("/setup-first-admin", async (req, res) => {
  try {
    const adminsSnapshot = await db.collection("admins").get();

    if (!adminsSnapshot.empty) {
      return res
        .status(400)
        .json({ error: "Admin already exists. Setup not allowed." });
    }

    // Create admin doc
    await db
      .collection("admins")
      .doc(req.user.uid)
      .set({
        role: "admin",
        email: req.user.email || "",
        createdAt: new Date(),
      });

    // Also update user doc if it exists
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (userDoc.exists) {
      await db.collection("users").doc(req.user.uid).update({
        role: "admin",
        approved: true,
      });
    }

    console.log(`👑 First admin created: ${req.user.uid} (${req.user.email})`);
    res.json({ success: true, message: "You are now the admin!" });
  } catch (error) {
    console.error("Error setting up admin:", error);
    res.status(500).json({ error: "Failed to setup admin" });
  }
});

module.exports = { adminRouter: router, setupRouter };
