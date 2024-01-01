import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import ApiResponse from "../utils/apiResponse.js";
import fs from "fs";
import jwt from "jsonwebtoken";

// Generate refresh and access token
const generateRefreshAndAccessToken = async (user) => {
  const accessToken = await user.generateAccessToken();
  const refreshToken = await user.generateRefreshToken();

  user.refreshToken = refreshToken;

  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};

// register user
const registerUser = asyncHandler(async (req, res) => {
  const { username, fullname, email, password } = req.body;

  // check for required fields
  if (
    [username, fullname, email, password].some(
      (field) => field === undefined || field?.trim() === "",
    )
  ) {
    throw new ApiError(400, "Required fields cannot be empty");
  }

  // avatar and coverImage local path
  let avatarLocalPath;
  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.avatar) &&
    req.files.avatar.length > 0
  ) {
    avatarLocalPath = req.files.avatar[0].path;
  }

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  // Check avatar local path exists or not
  if (!avatarLocalPath) {
    throw new ApiError(400, "Missing avatar image path");
  }

  // Check if any existing user found with the same username or email
  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existingUser) {
    // delete the avatar from server
    if (avatarLocalPath) {
      fs.unlinkSync(avatarLocalPath);
    }
    // delete the cover image from server
    if (coverImageLocalPath) {
      fs.unlinkSync(coverImageLocalPath);
    }
    throw new ApiError(409, "User already exists");
  }

  // upload the avatar and cover image
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // check avatar is uploaded successfully or not
  if (!avatar) {
    throw new ApiError(400, "Avatar upload failed");
  }

  // create a new user
  const newUser = await User.create({
    username: username.toLowerCase(),
    fullName: fullname,
    email: email.toLowerCase(),
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    password,
  });

  // fetch the user data from database
  const createdUser = await User.findById(newUser._id).select(
    "-password -refreshToken",
  );

  // Check if the user is created or not in the database.
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

// login user
const loginUser = asyncHandler(async (req, res) => {
  // get user data from request
  const { username, email, password } = req.body;

  // check for username or email is exists or not
  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  // check for password is exists or not
  if (!password) {
    throw new ApiError(400, "password is required");
  }

  // find existing user with username or email
  const existingUser = await User.findOne({ $or: [{ username }, { email }] });

  // check if existing user exists or not in the database
  if (!existingUser) {
    throw new ApiError(404, "User does not exist");
  }

  const isPasswordValid = await existingUser.isPasswordCorrect(password);
  // check for the password is correct or not
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  // generate refresh and access token
  const { accessToken, refreshToken } =
    await generateRefreshAndAccessToken(existingUser);

  existingUser.password = undefined;
  existingUser.refreshToken = undefined;

  // set cookie headers
  const options = { httpOnly: true, secure: true };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: existingUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully",
      ),
    );
});

// logout user
const logoutUser = asyncHandler(async (req, res) => {
  // remove refresh token on database
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: null,
      },
    },
    {
      new: true,
    },
  );

  // set cookie headers
  const options = { httpOnly: true, secure: true };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

// refresh access token
const refreshAccessToken = asyncHandler(async (req, res) => {
  const requestRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

  // check for refresh token exists or not
  if (!requestRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  // verify refresh token
  const decodedToken = jwt.verify(
    requestRefreshToken,
    process.env.REFRESH_TOKEN_SECRET,
  );

  // fetch user data from database
  const existingUser = await User.findById(decodedToken?._id);

  // check if user is exists or not
  if (!existingUser) {
    throw new ApiError(401, "Invalid refresh token");
  }

  // check the requested refresh token is same as database refresh token
  if (requestRefreshToken !== existingUser.refreshToken) {
    throw new ApiError(401, "Refresh token is expired or used!");
  }

  // generate refresh and access token
  const { accessToken, refreshToken } =
    await generateRefreshAndAccessToken(existingUser);

  // set cookie headers
  const options = { httpOnly: true, secure: true };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          accessToken,
          refreshToken,
        },
        "Access token refreshed successfully.",
      ),
    );
});

// changed current password
const changedCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

  // check for required fields
  if (
    [oldPassword, newPassword, confirmPassword].some(
      (field) => field === undefined || field?.trim() === "",
    )
  ) {
    throw new ApiError(400, "Required fields cannot be empty");
  }

  // check for new password and confirm password is same
  if (newPassword !== confirmPassword) {
    throw new ApiResponse(400, "Confirm password is not same as new password");
  }

  // fetch existing user data
  const existingUser = await User.findById(req.user?._id);

  // check old password is same in database
  const isPasswordCorrect = existingUser.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  // update new password
  existingUser.password = newPassword;
  await existingUser.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password updated successfully."));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changedCurrentPassword,
};
