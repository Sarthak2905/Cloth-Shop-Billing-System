import jwt from "jsonwebtoken";

// `tv` is the user's token version. Raising it on the user invalidates every old token.
export function signToken(user, config) {
  return jwt.sign(
    { role: user.role, tv: user.tokenVersion },
    config.jwtSecret,
    {
      subject: user._id,
      expiresIn: config.jwtExpiresIn,
      algorithm: "HS256",
    },
  );
}

export function verifyToken(token, config) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
}