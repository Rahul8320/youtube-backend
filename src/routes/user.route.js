import { Router } from "express";
import {
  changedCurrentPassword,
  getCurrentUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  updateAccountDetails,
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

// refresh token route
router.route("/refresh-token").post(refreshAccessToken);

// changed current password route
router.route("/changed-password").post(verifyJWT, changedCurrentPassword);

// get current user route
router.route("/current-user").post(verifyJWT, getCurrentUser);

// update user details route
router.route("/update-user").post(verifyJWT, updateAccountDetails);

export default router;
