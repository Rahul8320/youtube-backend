import { Router } from "express";
import {
  changedCurrentPassword,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// register route
router.route("/register").post(
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  registerUser,
);

// login route
router.route("/login").post(loginUser);

// secured routes
// logout route
router.route("/logout").post(verifyJWT, logoutUser);

// refresh token routes
router.route("/refresh-token").post(refreshAccessToken);

// changed current password routes
router.route("/changed-password").post(verifyJWT, changedCurrentPassword);

export default router;
