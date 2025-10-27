const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Generate access token
exports.generateAccessToken = (user) => {
  return jwt.sign(
    {
      user_id: user.user_id,
      username: user.username,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

// Generate refresh token
exports.generateRefreshToken = (user) => {
  return jwt.sign(
    {
      user_id: user.user_id,
      username: user.username
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

// Generate both tokens
exports.generateTokens = async (user) => {
  const accessToken = this.generateAccessToken(user);
  const refreshToken = this.generateRefreshToken(user);

  // Store refresh token in database
  await prisma.auth.update({
    where: { user_id: user.user_id },
    data: { refresh_token: refreshToken }
  });

  return { accessToken, refreshToken };
};

// Verify access token
exports.verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

// Verify refresh token
exports.verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

// Refresh access token using refresh token
exports.refreshAccessToken = async (refreshToken) => {
  try {
    const decoded = this.verifyRefreshToken(refreshToken);

    // Check if refresh token exists in database
    const auth = await prisma.auth.findFirst({
      where: {
        user_id: decoded.user_id,
        refresh_token: refreshToken
      },
      include: {
        user: {
          select: {
            user_id: true,
            username: true,
            email: true,
            full_name: true
          }
        }
      }
    });

    if (!auth) {
      throw new Error('Invalid refresh token');
    }

    // Generate new access token
    const accessToken = this.generateAccessToken(auth.user);

    return { accessToken, user: auth.user };
  } catch (error) {
    throw new Error('Failed to refresh token');
  }
};

// Revoke refresh token (logout)
exports.revokeRefreshToken = async (userId) => {
  try {
    await prisma.auth.update({
      where: { user_id: userId },
      data: { refresh_token: null }
    });
    return true;
  } catch (error) {
    throw new Error('Failed to revoke token');
  }
};