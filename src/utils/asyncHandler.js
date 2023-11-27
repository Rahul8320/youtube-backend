const asyncHandler = (requestHandler) => {
  (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

export default asyncHandler;

// another way using try catch
// const asyncHandler = (func) => async (req, res, next) => {
//   try {
//     await func(req, res, next);
//   } catch (err) {
//     return res
//       .status(err.code || 500)
//       .json({ success: false, message: err.message });
//   }
// };
