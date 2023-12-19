import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import ApiResponse from "../utils/apiResponse.js";
import fs from "fs";

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
  if (!username || !email) {
    throw new ApiError(400, "username or email is required");
  }

  // check for password is exists or not
  if (!password) {
    throw new ApiError(400, "password is required");
  }

  // find existing user with username or email
  const existingUser = await User.find({ $or: [{ username }, { email }] });

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

export { registerUser, loginUser };
