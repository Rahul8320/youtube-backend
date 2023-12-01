import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { REQUEST_SIZE_LIMIT } from "./constants.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_SIZE_LIMIT }));
app.use(express.static("public"));
app.use(cookieParser());

// router imports
import userRouter from "./routes/user.route.js";

//router declarations
app.use("/api/v1/users", userRouter);

export default app;
