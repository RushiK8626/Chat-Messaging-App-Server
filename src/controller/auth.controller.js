const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();
const otpService = require('../services/otp.service');
const jwtService = require('../services/jwt.service');

exports.register = async (req, res) => {
  try {
    const { full_name, username, email, password, phone } = req.body;
    
    // Validation
    if (!username || !password || (!email && !phone)) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    // Check for duplicates BEFORE transaction
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(409).json({ error: 'Username exists' });
    }
    
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return res.status(409).json({ error: 'Email exists' });
      }
    }
    
    if (phone) {
      const existingPhone = await prisma.user.findUnique({ where: { phone } });
      if (existingPhone) {
        return res.status(409).json({ error: 'Phone exists' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user (no transaction needed for OTP)
    const user = await prisma.user.create({
      data: {
        username,
        email,
        phone,
        full_name,
        status_message: 'Hey there! I am using ConvoHub',
        verified: false,
        auth: { create: { password_hash: hashedPassword } }
      }
    });
    
    console.log("✅ Created new user:", user.user_id);

    // Generate OTP (after user creation, so it persists even if email fails)
    const { otpCode, expiresAt } = await otpService.createOTP(user.user_id, 'register');
    console.log("✅ Generated OTP:", otpCode, "Expires:", expiresAt);
    console.log("✅ Generated OTP:", otpCode, "Expires:", expiresAt);

    // Try to send OTP
    // If this fails, user and OTP are still in DB, user can use resend
    try {
      const sendResult = await otpService.sendOTP(user, otpCode, 'register');
      console.log("✅ Successfully sent OTP");
      
      res.json({
        message: 'OTP sent for registration',
        userId: user.user_id,
        username: user.username,
        otpSentTo: sendResult.method,
        destination: sendResult.method === 'console' 
          ? 'Check terminal logs' 
          : sendResult.destination,
        expiresAt: expiresAt,
        ...(process.env.NODE_ENV !== 'production' && { 
          devOTP: otpCode
        })
      });
      
    } catch (otpError) {
      console.error("⚠️ Failed to send OTP:", otpError.message);
      
      // User and OTP are created, but email failed
      // Return OTP in dev mode so registration can continue
      res.status(201).json({
        message: 'User created but failed to send OTP. Please use resend OTP or check the OTP below.',
        userId: user.user_id,
        username: user.username,
        requiresResend: true,
        expiresAt: expiresAt,
        ...(process.env.NODE_ENV !== 'production' && { 
          devOTP: otpCode,
          note: 'Use this OTP to verify your registration'
        })
      });
    }

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    // Send appropriate error message
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        error: 'Username, email, or phone already exists'
      });
    }

    res.status(500).json({ 
      error: 'Registration failed. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


exports.verifyRegistrationOTP = async (req, res) => {
  try {
    const { userId, username, otpCode } = req.body;
    
    if ((!userId && !username) || !otpCode) {
      return res.status(400).json({ error: 'Username (or User ID) and OTP code are required' });
    }

    // Find user by username if username provided, otherwise use userId
    let user;
    if (username) {
      user = await prisma.user.findUnique({
        where: { username },
        select: { user_id: true }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    }

    const userIdToVerify = username ? user.user_id : parseInt(userId);

    const verification = await otpService.verifyOTP(userIdToVerify, otpCode, 'register');
    
    if (!verification.success) {
      return res.status(400).json({ error: verification.message });
    }

    // Mark user as verified
    await prisma.user.update({
      where: { user_id: userIdToVerify },
      data: { verified: true }
    });

    res.json({ message: 'Registration verified successfully. You can now log in.' });
    
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        auth: true
      }
    });

    if (!user || !user.auth) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is verified
    if (!user.verified) {
      return res.status(403).json({ 
        error: 'Account not verified. Please verify your account first.',
        userId: user.user_id,
        requiresVerification: true
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.auth.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate and send OTP
    const { otpCode, expiresAt } = await otpService.createOTP(user.user_id, 'login');

    // Send OTP
    try {
      const sendResult = await otpService.sendOTP(user, otpCode, 'login');
      
      res.json({
        message: 'OTP sent successfully',
        userId: user.user_id,
        otpSentTo: sendResult.method,
        destination: sendResult.method === 'console' 
          ? 'Check terminal logs' 
          : sendResult.destination,
        expiresAt,
        ...(process.env.NODE_ENV !== 'production' && { 
          devOTP: otpCode // Only in development
        })
      });
    } catch (otpError) {
      console.error('Failed to send login OTP:', otpError);
      return res.status(500).json({ 
        error: 'Failed to send verification code. Please try again.' 
      });
    }

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.verifyLoginOTP = async (req, res) => {
  try {
    const { userId, username, otpCode } = req.body;

    if ((!userId && !username) || !otpCode) {
      return res.status(400).json({ error: 'Username (or User ID) and OTP code are required' });
    }

    // Find user by username if username provided, otherwise use userId
    let user;
    if (username) {
      user = await prisma.user.findUnique({
        where: { username },
        select: { user_id: true }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    }

    const userIdToVerify = username ? user.user_id : parseInt(userId);

    // Verify OTP
    const verification = await otpService.verifyOTP(userIdToVerify, otpCode, 'login');

    if (!verification.success) {
      return res.status(400).json({ error: verification.message });
    }

    // Get user details
    const userDetails = await prisma.user.findUnique({
      where: { user_id: userIdToVerify },
      select: {
        user_id: true,
        username: true,
        email: true,
        full_name: true,
        profile_pic: true,
        status_message: true,
        verified: true
      }
    });

    if (!userDetails) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!userDetails.verified) {
      return res.status(403).json({ error: 'Account not verified' });
    }

    // Generate JWT tokens
    const { accessToken, refreshToken } = await jwtService.generateTokens(userDetails);

    // Update last login
    await prisma.auth.update({
      where: { user_id: userDetails.user_id },
      data: { last_login: new Date() }
    });

    res.json({
      message: 'Login successful',
      user: userDetails,
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
};


// Resend OTP
exports.resendOTP = async (req, res) => {
  try {
    const { userId, username, otpType = 'login' } = req.body;

    if (!userId && !username) {
      return res.status(400).json({ error: 'Username or User ID is required' });
    }

    // Find user by username if username provided, otherwise use userId
    let user;
    if (username) {
      user = await prisma.user.findUnique({
        where: { username },
        select: {
          user_id: true,
          email: true,
          phone: true,
          verified: true
        }
      });
    } else {
      user = await prisma.user.findUnique({
        where: { user_id: parseInt(userId) },
        select: {
          user_id: true,
          email: true,
          phone: true,
          verified: true
        }
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For login OTP, user must be verified
    // For register OTP, user must NOT be verified
    if (otpType === 'login' && !user.verified) {
      return res.status(403).json({ 
        error: 'Account not verified. Use otpType "register" to resend registration OTP.' 
      });
    }

    if (otpType === 'register' && user.verified) {
      return res.status(400).json({ 
        error: 'Account already verified. No need to resend registration OTP.' 
      });
    }

    // Generate new OTP (no transaction needed here)
    const { otpCode, expiresAt } = await otpService.createOTP(user.user_id, otpType);

    // Send OTP
    try {
      const sendResult = await otpService.sendOTP(user, otpCode, otpType);
      
      res.json({
        message: 'OTP resent successfully',
        otpSentTo: sendResult.method,
        destination: sendResult.method === 'console' 
          ? 'Check terminal logs' 
          : sendResult.destination,
        expiresAt,
        ...(process.env.NODE_ENV !== 'production' && { 
          devOTP: otpCode
        })
      });
    } catch (otpError) {
      console.error('Failed to resend OTP:', otpError);
      return res.status(500).json({ 
        error: 'Failed to resend verification code. Please try again.' 
      });
    }

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
};

// Resend Registration OTP (dedicated endpoint for clarity)
exports.resendRegistrationOTP = async (req, res) => {
  try {
    const { userId, username } = req.body;

    if (!userId && !username) {
      return res.status(400).json({ error: 'Username or User ID is required' });
    }

    // Find user by username if username provided, otherwise use userId
    let user;
    if (username) {
      user = await prisma.user.findUnique({
        where: { username },
        select: {
          user_id: true,
          username: true,
          email: true,
          phone: true,
          verified: true
        }
      });
    } else {
      user = await prisma.user.findUnique({
        where: { user_id: parseInt(userId) },
        select: {
          user_id: true,
          username: true,
          email: true,
          phone: true,
          verified: true
        }
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already verified
    if (user.verified) {
      return res.status(400).json({ 
        error: 'Account already verified. Please proceed to login.' 
      });
    }

    // Generate new registration OTP
    const { otpCode, expiresAt } = await otpService.createOTP(user.user_id, 'register');

    // Send OTP
    try {
      const sendResult = await otpService.sendOTP(user, otpCode, 'register');
      
      res.json({
        message: 'Registration OTP resent successfully',
        userId: user.user_id,
        username: user.username,
        otpSentTo: sendResult.method,
        destination: sendResult.method === 'console' 
          ? 'Check terminal logs' 
          : sendResult.destination,
        expiresAt,
        ...(process.env.NODE_ENV !== 'production' && { 
          devOTP: otpCode
        })
      });
    } catch (otpError) {
      console.error('Failed to resend registration OTP:', otpError);
      
      // Even if sending fails, return the OTP in dev mode
      return res.status(500).json({ 
        error: 'Failed to send verification code. Please check your email configuration.',
        ...(process.env.NODE_ENV !== 'production' && { 
          devOTP: otpCode,
          userId: user.user_id,
          expiresAt
        })
      });
    }

  } catch (error) {
    console.error('Resend registration OTP error:', error);
    res.status(500).json({ 
      error: 'Failed to resend registration OTP',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Refresh access token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const { accessToken, user } = await jwtService.refreshAccessToken(refreshToken);

    res.json({
      message: 'Token refreshed successfully',
      accessToken,
      user
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ error: error.message || 'Failed to refresh token' });
  }
};

// Logout
exports.logout = async (req, res) => {
  try {
    const userId = req.user.user_id; // From auth middleware

    await jwtService.revokeRefreshToken(userId);

    res.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Get current user (requires JWT)
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { user_id: req.user.user_id },
      select: {
        user_id: true,
        username: true,
        email: true,
        full_name: true,
        phone: true,
        profile_pic: true,
        status_message: true,
        created_at: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};