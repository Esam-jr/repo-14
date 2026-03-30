const express = require("express");
const { AppError } = require("../../errors");
const { PUBLIC_REGISTER_ROLES } = require("./constants");
const { validateRegisterInput, validateLoginInput } = require("./validators");
const { refreshCookieOptions } = require("./token");
const { requireAuth, requireRole } = require("./middleware");
const { register, login, refresh, logout, sanitizeUser } = require("./service");
const { findUserById } = require("./repository");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function createAuthRouter(pool) {
  const router = express.Router();

  router.post("/register", asyncHandler(async (req, res) => {
    const body = req.body || {};
    const requestedRole = body.role == null ? "student" : String(body.role).trim().toLowerCase();

    if (!req.auth && !PUBLIC_REGISTER_ROLES.includes(requestedRole)) {
      throw new AppError(403, "forbidden", "Public registration cannot assign privileged roles.");
    }

    const payload = validateRegisterInput(body, { allowedRoles: PUBLIC_REGISTER_ROLES });
    const user = await register(pool, payload);
    res.status(201).json({ user });
  }));

  router.post("/login", asyncHandler(async (req, res) => {
    const payload = validateLoginInput(req.body || {});
    const session = await login(pool, payload.email, payload.password);

    res
      .cookie("refresh_token", session.refreshToken, refreshCookieOptions())
      .status(200)
      .json({
        access_token: session.accessToken,
        token_type: "Bearer",
        expires_in: session.accessTokenExpiresIn,
        user: session.user
      });
  }));

  router.post("/refresh", asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) {
      throw new AppError(401, "missing_refresh_token", "Refresh token is required.");
    }

    const session = await refresh(pool, refreshToken);

    res
      .cookie("refresh_token", session.refreshToken, refreshCookieOptions())
      .status(200)
      .json({
        access_token: session.accessToken,
        token_type: "Bearer",
        expires_in: session.accessTokenExpiresIn,
        user: session.user
      });
  }));

  router.post("/logout", asyncHandler(async (req, res) => {
    await logout(pool, req.cookies.refresh_token);
    res.clearCookie("refresh_token", refreshCookieOptions());
    res.status(200).json({ ok: true });
  }));

  router.get("/me", requireAuth, asyncHandler(async (req, res) => {
    const user = await findUserById(pool, req.auth.userId);
    if (!user) {
      throw new AppError(404, "not_found", "User not found.");
    }

    res.status(200).json({ user: sanitizeUser(user) });
  }));

  router.get("/admin/panel", requireAuth, requireRole("admin"), asyncHandler(async (_req, res) => {
    res.status(200).json({ message: "admin_access_granted" });
  }));

  router.get(
    "/cohorts/:cohortId/resource",
    requireAuth,
    requireRole(["faculty", "mentor", "admin"], (req) => ({ cohort: [req.params.cohortId] })),
    asyncHandler(async (req, res) => {
      res.status(200).json({
        message: "scoped_access_granted",
        cohort: req.params.cohortId
      });
    })
  );

  return router;
}

module.exports = {
  createAuthRouter
};
