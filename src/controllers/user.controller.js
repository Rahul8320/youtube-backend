import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import ApiResponse from "../utils/apiResponse.js";
import fs from "fs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

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
    req.user?._id,
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

// get current user details
const getCurrentUser = asyncHandler(async (req, res) => {
  const user = req.user;

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "Current user fetch successfully."));
});

// update user details
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body;

  if (!fullname || !email) {
    throw new ApiError(400, "Required fields cannot be empty!");
  }

  // update user details
  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName: fullname,
        email: email,
      },
    },
    { new: true },
  ).select("-password");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: updatedUser },
        "Account details updated successfully!",
      ),
    );
});

// update user profile picture
const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required.");
  }

  // upload user profile picture
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading avatar.");
  }

  // update user details
  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true },
  ).select("-password");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: updatedUser },
        "Avatar updated successfully!",
      ),
    );
});

// update user cover image
const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is required.");
  }

  // upload user cover image
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading cover image.");
  }

  // update user details
  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true },
  ).select("-password");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: updatedUser },
        "Cover image updated successfully!",
      ),
    );
});

// get user channel profile
const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  // check is username is exists or not
  if (!username?.trim()) {
    throw new ApiError(400, "Username is required.");
  }

  // fetch user channel profile data
  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        channelSubscribedToCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: {
              $in: [req.user?._id, "$subscribers.subscriber"],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        avatar: 1,
        coverImage: 1,
        createdAt: 1,
        subscribersCount: 1,
        channelSubscribedToCount: 1,
        isSubscribed: 1,
      },
    },
  ]);

  //  check is channel exists or not
  if (!channel?.length) {
    throw new ApiError(404, "Channel does not exists.");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        channel: channel[0],
      },
      "Channel details fetched successfully.",
    ),
  );
});

// get user watch history
const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { watchHistory: user[0].watchHistory },
        "Watch history fetch successfully",
      ),
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changedCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
};
