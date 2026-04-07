// auth.js — Firebase Auth wrapper (compat SDK, defensive initialization)
// Requires: firebase-app-compat, firebase-auth-compat loaded before this file
// and firebase.js (which sets window._auth and window._db)

(function () {
  'use strict';

  // ── Error code → readable message ─────────────────────────
  function friendlyError(code) {
    const MAP = {
      'auth/user-not-found':         'No account found with this email.',
      'auth/wrong-password':         'Incorrect password. Please try again.',
      'auth/invalid-credential':     'Invalid email or password.',
      'auth/invalid-email':          'Please enter a valid email address.',
      'auth/email-already-in-use':   'An account with this email already exists.',
      'auth/weak-password':          'Password must be at least 6 characters.',
      'auth/too-many-requests':      'Too many attempts — please wait a moment.',
      'auth/popup-closed-by-user':   'Google sign-in was cancelled.',
      'auth/network-request-failed': 'Network error. Check your connection.',
      'auth/operation-not-allowed':  'Email/password sign-in is not enabled in Firebase Console.',
    };
    return MAP[code] || ('Error: ' + (code || 'Authentication failed'));
  }

  // ── Get auth instance (safe accessor) ───────────────────────
  function auth() {
    if (!window._auth) {
      console.error('[Auth] Firebase _auth not initialized. Check firebase.js loaded before auth.js.');
    }
    return window._auth;
  }

  // ── Sign in with email + password ────────────────────────────
  async function login(email, password) {
    const a = auth();
    if (!a) return { ok: false, error: 'Firebase not initialized.' };
    try {
      const cred = await a.signInWithEmailAndPassword(email.trim(), password);
      return { ok: true, user: cred.user };
    } catch (err) {
      console.error('[Auth] login error:', err.code, err.message);
      return { ok: false, error: friendlyError(err.code) };
    }
  }

  // ── Sign in with Google popup ─────────────────────────────────
  async function loginWithGoogle() {
    const a = auth();
    if (!a) return { ok: false, error: 'Firebase not initialized.' };
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result   = await a.signInWithPopup(provider);
      return { ok: true, user: result.user };
    } catch (err) {
      console.error('[Auth] Google login error:', err.code, err.message);
      return { ok: false, error: friendlyError(err.code) };
    }
  }

  // ── Register new account ──────────────────────────────────────
  async function register(email, password) {
    const a = auth();
    if (!a) return { ok: false, error: 'Firebase not initialized.' };
    try {
      const cred = await a.createUserWithEmailAndPassword(email.trim(), password);
      return { ok: true, user: cred.user };
    } catch (err) {
      console.error('[Auth] register error:', err.code, err.message);
      return { ok: false, error: friendlyError(err.code) };
    }
  }

  // ── Sign out ──────────────────────────────────────────────────
  async function logout() {
    const a = auth();
    if (a) await a.signOut();
    window.location.href = 'login.html';
  }

  // ── Synchronous user getter ───────────────────────────────────
  function getUser() {
    const a = auth();
    return a ? a.currentUser : null;
  }

  function isLoggedIn() {
    const a = auth();
    return a ? a.currentUser !== null : false;
  }

  /**
   * requireAuth(callback)
   *
   * Uses onAuthStateChanged (async) to wait for Firebase to resolve
   * the session from IndexedDB. Redirects to login.html if no user.
   * Calls callback(user) once authenticated.
   */
  function requireAuth(callback) {
    const a = auth();
    if (!a) {
      console.error('[Auth] requireAuth called before Firebase initialized.');
      window.location.href = 'login.html';
      return;
    }
    a.onAuthStateChanged(function (user) {
      if (!user) {
        window.location.href = 'login.html';
      } else {
        console.log('[Auth] User authenticated:', user.email);
        if (typeof callback === 'function') callback(user);
      }
    });
  }

  // ── Expose globally ───────────────────────────────────────────
  window.Auth = { login, loginWithGoogle, register, logout, getUser, isLoggedIn, requireAuth };
  console.log('[Auth] Module loaded ✓');

})();

