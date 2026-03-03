import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./Firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/**
 * Check authentication state
 * @param {boolean} requireAuth - If true, redirect to login if not authenticated
 * @param {boolean} redirectIfAuth - If true, redirect to app.html if authenticated (for login page)
 */
export function checkAuth(requireAuth = false, redirectIfAuth = false) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("User is logged in:", user.email);

      // Check approval status from Firestore
      try {
        const userDoc = await getDoc(doc(firestore, "users", user.uid));

        if (userDoc.exists()) {
          const userData = userDoc.data();

          // Update last login
          updateDoc(doc(firestore, "users", user.uid), {
            lastLogin: serverTimestamp(),
          }).catch((err) => console.warn("Failed to update lastLogin:", err));

          // Master Admin Bypass for testing
          const isMasterAdmin =
            user.email && user.email.toLowerCase() === "admin@internbook.com";

          if (!user.emailVerified && !isMasterAdmin) {
            if (redirectIfAuth) {
              showWaitingScreen(user.email, true); // true for verification
              return;
            }
            if (requireAuth) {
              window.location.replace("/login.html?verify=true");
              return;
            }
          }

          // Check if admin and update UI
          const isAdminUser = (await checkIsAdmin(user.uid)) || isMasterAdmin;

          // User is verified, meaning they're allowed into the basic app!
          if (redirectIfAuth) {
            if (isAdminUser) {
              window.location.replace("/master/admin-dashboard.html");
            } else {
              window.location.replace("/app.html");
            }
            return;
          }

          // If they are an admin and somehow try to access /app.html directly, redirect them
          if (isAdminUser && window.location.pathname.endsWith("/app.html")) {
            window.location.replace("/master/admin-dashboard.html");
            return;
          }

          // Pass userData.approved as the bulk access flag (as per new requirements)
          updateAuthUI(
            user,
            isAdminUser,
            userData.approved === true || userData.allowBulkFill || false,
            userData,
          );
        } else {
          // No user doc — create one (edge case: registered before this system)
          await createUserDoc(user);
          if (redirectIfAuth) {
            showWaitingScreen(user.email);
            return;
          }
          if (requireAuth) {
            window.location.replace("/login.html?waiting=true");
            return;
          }
        }
      } catch (error) {
        console.error("Error checking user approval:", error);
        // On error, allow access but log it
        if (redirectIfAuth) {
          window.location.replace("/app.html");
        }
        updateAuthUI(user, false);
      }
    } else {
      console.log("User is logged out");
      if (requireAuth) {
        window.location.replace("/login.html");
      }
    }

    // Dispatch event that auth is ready
    window.isAuthReady = true;
    window.authUser = user;
    window.dispatchEvent(new CustomEvent("auth-ready", { detail: { user } }));
  });
}

/**
 * Create Firestore user document
 */
async function createUserDoc(user) {
  try {
    await setDoc(doc(firestore, "users", user.uid), {
      email: user.email,
      displayName: user.displayName || "",
      role: "student",
      approved: false,
      active: true,
      allowedTemplates: [],
      createdAt: serverTimestamp(),
    });
    console.log("User document created in Firestore");
  } catch (error) {
    console.error("Error creating user document:", error);
  }
}

/**
 * Check if user is admin
 */
async function checkIsAdmin(uid) {
  try {
    const adminDoc = await getDoc(doc(firestore, "admins", uid));
    return adminDoc.exists();
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Public isAdmin check (for other modules)
 */
export async function isAdmin() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        resolve(await checkIsAdmin(user.uid));
      } else {
        resolve(false);
      }
    });
  });
}

/**
 * Public bulk fill access check (for other modules)
 */
export async function hasBulkFillAccess() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        const isAdminUser = await checkIsAdmin(user.uid);
        if (isAdminUser) return resolve(true);

        try {
          const userDoc = await getDoc(doc(firestore, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            // Bulk fill access requires explicit admin approval now
            if (data.approved || data.allowBulkFill) {
              return resolve(true);
            }
          }
        } catch (error) {
          console.error("Error checking bulk access:", error);
        }
      }
      resolve(false);
    });
  });
}

/**
 * Get Firebase ID token for API calls
 */
export async function getIdToken() {
  const user = auth.currentUser;
  if (user) {
    return await user.getIdToken();
  }
  return null;
}

/**
 * Login function
 */
export async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );

    // Establish server-side session
    const idToken = await userCredential.user.getIdToken();
    const res = await fetch("/api/sessionLogin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) {
      console.warn("Failed to establish server session");
    }

    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Register function
 */
export async function register(email, password, fullName) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );

    // Update profile with name
    if (fullName) {
      await updateProfile(userCredential.user, {
        displayName: fullName,
      });
    }

    // Establish server-side session directly after Auth identity creation
    const idToken = await userCredential.user.getIdToken();
    const res = await fetch("/api/sessionLogin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    // Check for bans via HTTP status
    if (res.status === 403) {
      await signOut(auth);
      return {
        success: false,
        error:
          "This account has been permanently restricted from accessing the application.",
      };
    }

    // Create Firestore user document
    await createUserDoc(userCredential.user);

    // Send email verification
    try {
      await sendEmailVerification(userCredential.user);
      console.log("Verification email sent");
    } catch (err) {
      console.error("Error sending verification email:", err);
    }

    if (!res.ok) {
      console.warn("Failed to establish server session");
    }

    return {
      success: true,
      user: userCredential.user,
      needsApproval: true,
      emailSent: true,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Google Login function
 */
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Establish server-side session first to check ban status
    const idToken = await user.getIdToken();
    const res = await fetch("/api/sessionLogin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    // Check for bans via HTTP status
    if (res.status === 403) {
      await signOut(auth);
      return {
        success: false,
        error:
          "This account has been permanently restricted from accessing the application.",
      };
    }

    if (!res.ok) {
      console.warn("Failed to establish server session");
    }

    // Check if user exists, if not create doc
    const userDocRef = doc(firestore, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    let isNewUser = false;
    if (!userDoc.exists()) {
      await createUserDoc(user);
      isNewUser = true;
    }

    return { success: true, user, needsApproval: isNewUser };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Logout function
 */
export async function logout() {
  try {
    await signOut(auth);

    // Clear server session
    try {
      await fetch("/api/sessionLogout", { method: "POST" });
    } catch (err) {
      console.warn("Failed to clear server session:", err);
    }

    window.location.href = "/login.html";
  } catch (error) {
    console.error("Logout error:", error);
  }
}

/**
 * Show "Waiting for Admin Approval" or "Verify Email" screen
 */
function showWaitingScreen(email, needsVerification = false) {
  const waitingEl = document.getElementById("waitingScreen");
  const loginForm = document.getElementById("loginForm");
  const loginFormWrapper = document.getElementById("loginFormWrapper");
  const formContainer = document.querySelector(".form-container");

  const title = needsVerification
    ? "Verify Your Email"
    : "Waiting for Admin Approval";
  const subtext = needsVerification
    ? `We've sent a verification link to <strong style="color:var(--primary-light)">${email}</strong>. Please check your inbox and click the link to continue.`
    : `Your account <strong style="color:var(--primary-light)">${email}</strong> is pending admin approval. You'll be able to access the dashboard once approved.`;
  const icon = needsVerification
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;color:var(--primary-light)">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;color:var(--primary-light)">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>`;

  if (waitingEl) {
    waitingEl.style.display = "block";
    if (loginFormWrapper) loginFormWrapper.style.display = "none";
    else if (loginForm) loginForm.style.display = "none";

    const titleEl = waitingEl.querySelector("h2");
    if (titleEl) titleEl.textContent = title;

    const emailEl =
      waitingEl.querySelector(".waiting-email") ||
      document.getElementById("waitingEmail");
    if (emailEl) {
      emailEl.innerHTML = subtext;
    }
  } else if (formContainer) {
    // Inject waiting screen if element doesn't exist
    formContainer.innerHTML = `
            <div class="waiting-screen">
                <div class="waiting-icon">
                    ${icon}
                </div>
                <h2 style="color:white;margin:1rem 0 0.5rem">${title}</h2>
                <p style="color:var(--text-secondary);margin-bottom:1.5rem">
                    ${subtext}
                </p>
                <button onclick="document.querySelector('[data-logout]').click()" class="btn-login" style="background:var(--bg-elevated);box-shadow:none">
                    Sign Out
                </button>
            </div>
        `;
  }
}

/**
 * Update UI elements based on auth state
 */
function updateAuthUI(
  user,
  isAdminUser = false,
  allowBulkFill = false,
  userData = null,
) {
  // Configure the unified dropdown menu elements
  const profileMenuBtn = document.getElementById("profileMenuBtn");
  const logoutOption = document.getElementById("logoutOption");

  if (profileMenuBtn) {
    const nameSpan = profileMenuBtn.querySelector(".login-text");
    if (nameSpan) {
      let displayName = "Profile";
      if (userData && userData.fullName) {
        displayName = userData.fullName.split(" ")[0]; // Use first name
      } else if (user && user.email) {
        displayName = user.email.split("@")[0];
      }
      nameSpan.textContent = displayName;
    }
  }

  if (logoutOption) {
    logoutOption.onclick = (e) => {
      e.preventDefault();
      logout();
    };
  }

  // Update the credit counter if it exists
  const creditCounter = document.getElementById("creditCounter");
  if (creditCounter) {
    let credits = 0;
    if (userData && typeof userData.bulkCredits !== "undefined") {
      credits = userData.bulkCredits;
    }
    creditCounter.textContent = `${credits} left`;
    creditCounter.classList.remove("hidden");
  }

  // Add Admin Panel link and show restricted features if user is admin
  if (isAdminUser) {
    // Show admin link in navbar (new App.html structure)
    const adminBtn = document.getElementById("adminBtn");
    if (adminBtn) {
      adminBtn.classList.remove("hidden");
    } else {
      // Fallback for older pages that haven't been migrated
      const navLinks = document.querySelector(".nav-links");
      if (navLinks && !document.getElementById("adminLink")) {
        const adminLink = document.createElement("a");
        adminLink.href = "/admin";
        adminLink.className = "nav-link";
        adminLink.id = "adminLink";
        adminLink.textContent = "⚙️ Admin";
        adminLink.style.marginRight = "8px";
        adminLink.style.background = "rgba(99, 102, 241, 0.2)";
        adminLink.style.borderColor = "var(--primary)";
        navLinks.insertBefore(adminLink, navLinks.firstChild);
      }
    }

    // Update all links pointing to /app.html to point to /master/admin-dashboard.html
    document.querySelectorAll('a[href="/app.html"]').forEach((link) => {
      link.href = "/master/admin-dashboard.html";
    });
  }

  // Show bulk fill container to ALL authenticated users
  // Credits are checked at generation time, not at access time
  const bulkFillContainer = document.getElementById("bulkFillContainer");
  if (bulkFillContainer) {
    bulkFillContainer.classList.remove("hidden");
  }

  // Auto-open profile modal if requested via URL
  if (window.location.search.includes("openProfile=true")) {
    const modal = document.getElementById("profileModal");
    if (modal && modal.firstElementChild) {
      modal.classList.remove("opacity-0", "pointer-events-none");
      modal.firstElementChild.classList.remove("scale-95");
      modal.firstElementChild.classList.add("scale-100");

      // Clean up the URL
      const url = new URL(window.location);
      url.searchParams.delete("openProfile");
      window.history.replaceState({}, document.title, url);
    }
  }
}

/**
 * Get current user ID (Promise)
 * Exposed globally for non-module scripts
 */
window.getCurrentUserId = () => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user ? user.uid : null);
    });
  });
};

/**
 * Get Firebase ID token (global)
 */
window.getFirebaseToken = async () => {
  if (auth.currentUser) {
    return await auth.currentUser.getIdToken();
  }
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        resolve(await user.getIdToken());
      } else {
        resolve(null);
      }
    });
  });
};

/**
 * Expose logout function globally for HTML onclick handlers
 */
window.logout = logout;
