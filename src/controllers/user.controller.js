import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import ApiResponse from "../utils/apiResponse.js";

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

  // Check if any existing user found with the same username or email
  const existingUser = User.findOne({
    $or: [{ username }, { email }],
  });

  if (existingUser) {
    throw new ApiError(409, "User already exists");
  }

  // avatar and coverImage local path
  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;

  // Check avatar local path exists or not
  if (!avatarLocalPath) {
    throw new ApiError(400, "Missing avatar image path");
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

export { registerUser };
