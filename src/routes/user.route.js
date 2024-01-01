import { Router } from "express";
import {
  changedCurrentPassword,
  getCurrentUser,
  getUserChannelProfile,
  getWatchHistory,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
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
router.route("/current-user").get(verifyJWT, getCurrentUser);

// update account details route
router.route("/update-account").patch(verifyJWT, updateAccountDetails);

// update profile picture route
router
  .route("/update-profile-picture")
  .patch(verifyJWT, upload.single("avatar"), updateUserAvatar);

// update cover image route
router
  .route("/update-cover-image")
  .patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage);

// get user details by username route
router.route("/channel/:username").get(verifyJWT, getUserChannelProfile);

// get watched history route
router.route("/watch-history").get(verifyJWT, getWatchHistory);

export default router;
