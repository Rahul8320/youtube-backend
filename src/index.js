import dotenv from "dotenv";
import connectDB from "./db/index.js";
import app from "./app.js";

dotenv.config({
  path: "./.env",
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(` ⚙️ Server listening on ${PORT} `);
    });
  })
  .catch((err) => {
    console.log("Database Connection Error: " + err);
  });
