// In-memory store for pending password resets
const pendingPasswordResets = new Map(); // userId -> { otpCode, expiresAt, timeoutId }

// Request password reset (send OTP)
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const otpCode = otpService.generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const timeoutId = setTimeout(() => {
      pendingPasswordResets.delete(user.user_id);
    }, 5 * 60 * 1000);
    pendingPasswordResets.set(user.user_id, { otpCode, expiresAt, timeoutId });
    // TODO: Send OTP via email (implement email sending logic here)
    console.log(`🔑 Password reset OTP for ${email}:`, otpCode);
    res.json({ 
      user_id: user.user_id,
      message: 'OTP sent to email if user exists' 
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Password reset request failed' });
  }
};

// Reset password using OTP
exports.resetPassword = async (req, res) => {
  try {
    const { userId, otpCode, newPassword } = req.body;
    if (!userId || !otpCode || !newPassword) {
      return res.status(400).json({ error: 'userId, otpCode, and newPassword are required' });
    }
    const resetData = pendingPasswordResets.get(userId);
    if (!resetData) {
      return res.status(400).json({ error: 'OTP expired or invalid' });
    }
    if (resetData.expiresAt < Date.now()) {
      pendingPasswordResets.delete(userId);
      clearTimeout(resetData.timeoutId);
      return res.status(400).json({ error: 'OTP expired' });
    }
    if (String(resetData.otpCode) !== String(otpCode)) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.auth.update({
      where: { user_id: userId },
      data: { password_hash: hashedPassword }
    });
    clearTimeout(resetData.timeoutId);
    pendingPasswordResets.delete(userId);
    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
};
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();
const otpService = require('../services/otp.service');
const jwtService = require('../services/jwt.service');

// In-memory store for pending registrations (use Map with automatic cleanup)
const pendingRegistrations = new Map(); // username -> { userData, otpCode, expiresAt, timeoutId }

// In-memory store for pending login OTPs
const pendingLogins = new Map(); // userId -> { otpCode, expiresAt, timeoutId, userData }

// Cleanup expired registrations periodically
setInterval(() => {
  const now = Date.now();
  for (const [username, data] of pendingRegistrations.entries()) {
    if (data.expiresAt < now) {
      pendingRegistrations.delete(username);
      console.log(`⏰ Registration expired for username: ${username}`);
    }
  }
  
  // Cleanup expired login OTPs
  for (const [userId, data] of pendingLogins.entries()) {
    if (data.expiresAt < now) {
      pendingLogins.delete(userId);
      console.log(`⏰ Login OTP expired for userId: ${userId}`);
    }
  }
}, 60000); // Check every minute

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

    const otpCode = otpService.generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes from now

    console.log('🔑 Generated OTP for registration:', {
      username,
      otpCode,
      otpType: typeof otpCode,
      expiresAt: new Date(expiresAt)
    });

    // Set timeout to auto-delete after 5 minutes
    const timeoutId = setTimeout(() => {
      pendingRegistrations.delete(username);
      console.log(`⏰ Registration auto-expired for username: ${username}`);
    }, 5 * 60 * 1000);

    // Store user data in memory
    pendingRegistrations.set(username, {
      userData: { full_name, username, email, phone, password: hashedPassword },
      otpCode,
      expiresAt,
      timeoutId
    });

    console.log(`📝 Pending registration created for: ${username}, OTP: ${otpCode}`);

    await otpService.sendOTP({ email, phone }, otpCode, 'register');

    res.status(200).json({ 
      message: 'OTP sent. Please verify to complete registration.',
      expiresIn: 300 // seconds
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

exports.verifyRegistrationOTP = async (req, res) => {
  try {
    const { username, otpCode } = req.body;

    console.log('🔍 OTP Verification Request:', { username, otpCode });

    if (!username || !otpCode) {
      return res.status(400).json({ error: 'Username and OTP code are required' });
    }

    const registrationData = pendingRegistrations.get(username);

    if (!registrationData) {
      console.log('❌ No pending registration found for username:', username);
      return res.status(400).json({ error: 'OTP expired or invalid. Please register again.' });
    }

    console.log('📝 Stored Registration Data:', {
      username,
      storedOTP: registrationData.otpCode,
      enteredOTP: otpCode,
      expiresAt: new Date(registrationData.expiresAt),
      isExpired: registrationData.expiresAt < Date.now()
    });

    // Check if OTP expired
    if (registrationData.expiresAt < Date.now()) {
      pendingRegistrations.delete(username);
      clearTimeout(registrationData.timeoutId);
      console.log('⏰ OTP expired for username:', username);
      return res.status(400).json({ error: 'OTP expired. Please register again.' });
    }

    // Compare OTPs (both as strings)
    const storedOTP = String(registrationData.otpCode);
    const enteredOTP = String(otpCode);
    
    console.log('🔐 OTP Comparison:', {
      storedOTP,
      enteredOTP,
      storedType: typeof registrationData.otpCode,
      enteredType: typeof otpCode,
      match: storedOTP === enteredOTP
    });

    if (storedOTP !== enteredOTP) {
      console.log('❌ OTP mismatch!');
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    console.log('✅ OTP matched! Creating user...');

    try {
      const { userData } = registrationData;

      // Create user in the database
      const newUser = await prisma.user.create({
        data: {
          username: userData.username,
          email: userData.email,
          phone: userData.phone,
          full_name: userData.full_name,
          status_message: 'Hey there! I am using ConvoHub',
          verified: true,
          auth: { create: { password_hash: userData.password } },
        },
      });

      // Clear timeout and remove from pending registrations
      clearTimeout(registrationData.timeoutId);
      pendingRegistrations.delete(username);

      console.log(`✅ User ${username} registered successfully`);

      res.status(201).json({ 
        message: 'Registration successful.', 
        user: {
          user_id: newUser.user_id,
          username: newUser.username,
          email: newUser.email,
          full_name: newUser.full_name
        }
      });
    } catch (dbError) {
      console.error('Database error during registration:', dbError);
      return res.status(500).json({ error: 'Failed to create user. Please try again.' });
    }
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'OTP verification failed. Please try again.' });
  }
};

// Cancel registration if user leaves OTP verification page
exports.cancelRegistration = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const registrationData = pendingRegistrations.get(username);

    if (registrationData) {
      clearTimeout(registrationData.timeoutId);
      pendingRegistrations.delete(username);
      console.log(`✅ Registration canceled for username: ${username}`);
      res.status(200).json({ message: 'Registration canceled successfully. You can register again.' });
    } else {
      // No pending registration found (already expired or completed)
      res.status(404).json({ error: 'No pending registration found' });
    }
  } catch (error) {
    console.error('Cancel registration error:', error);
    res.status(500).json({ error: 'Failed to cancel registration' });
  }
};

// Resend registration OTP (for users who didn't complete verification)
exports.resendRegistrationOTP = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const registrationData = pendingRegistrations.get(username);

    if (!registrationData) {
      return res.status(400).json({ 
        error: 'No pending registration found. Please register again.' 
      });
    }

    // Generate new OTP
    const newOtpCode = otpService.generateOTP();
    const newExpiresAt = Date.now() + 5 * 60 * 1000;

    // Clear old timeout and set new one
    clearTimeout(registrationData.timeoutId);
    const newTimeoutId = setTimeout(() => {
      pendingRegistrations.delete(username);
      console.log(`⏰ Registration auto-expired for username: ${username}`);
    }, 5 * 60 * 1000);

    // Update with new OTP and expiry
    registrationData.otpCode = newOtpCode;
    registrationData.expiresAt = newExpiresAt;
    registrationData.timeoutId = newTimeoutId;

    try {
      await otpService.sendOTP(
        { 
          email: registrationData.userData.email, 
          phone: registrationData.userData.phone 
        }, 
        newOtpCode, 
        'register'
      );

      console.log(`🔄 OTP resent for username: ${username}`);

      res.status(200).json({ 
        message: 'OTP resent successfully. Please check your email/phone.',
        expiresIn: 300,
        ...(process.env.NODE_ENV !== 'production' && { devOTP: newOtpCode })
      });
    } catch (sendError) {
      console.error('Failed to resend OTP:', sendError);
      res.status(500).json({ 
        error: 'Failed to send OTP. Please try again.',
        ...(process.env.NODE_ENV !== 'production' && { devOTP: newOtpCode })
      });
    }
  } catch (error) {
    console.error('Resend registration OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
};

// Export the Maps for use in socket handler
exports.getPendingRegistrations = () => pendingRegistrations;
exports.getPendingLogins = () => pendingLogins;

exports.login = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: { 
        OR: [
          { username },
          { email }
        ]
      },
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

    // Generate OTP
    const otpCode = otpService.generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    console.log('🔑 Generated OTP for login:', {
      userId: user.user_id,
      username: user.username,
      otpCode,
      otpType: typeof otpCode,
      expiresAt: new Date(expiresAt)
    });

    // Set timeout to auto-delete after 5 minutes
    const timeoutId = setTimeout(() => {
      pendingLogins.delete(user.user_id);
      console.log(`⏰ Login OTP auto-expired for userId: ${user.user_id}`);
    }, 5 * 60 * 1000);

    // Store OTP in memory
    pendingLogins.set(user.user_id, {
      otpCode,
      expiresAt,
      timeoutId,
      userData: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        phone: user.phone
      }
    });

    console.log(`📝 Pending login OTP created for: ${user.username}, OTP: ${otpCode}`);

    // Send OTP
    try {
      const sendResult = await otpService.sendOTP(user, otpCode, 'login');
      
      res.json({
        message: 'OTP sent successfully',
        userId: user.user_id,
        username: user.username,
        otpSentTo: sendResult.method,
        destination: sendResult.method === 'console' 
          ? 'Check terminal logs' 
          : sendResult.destination,
        expiresIn: 300,
        ...(process.env.NODE_ENV !== 'production' && { 
          devOTP: otpCode // Only in development
        })
      });
    } catch (otpError) {
      console.error('Failed to send login OTP:', otpError);
      return res.status(500).json({ 
        error: 'Failed to send verification code. Please try again.',
        ...(process.env.NODE_ENV !== 'production' && { 
          devOTP: otpCode
        })
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

    console.log('🔍 Login OTP Verification Request:', { userId, username, otpCode });

    if ((!userId && !username) || !otpCode) {
      return res.status(400).json({ error: 'Username (or User ID) and OTP code are required' });
    }

    // Find user by username if username provided, otherwise use userId
    let userIdToVerify;
    if (username) {
      const user = await prisma.user.findUnique({
        where: { username },
        select: { user_id: true }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      userIdToVerify = user.user_id;
    } else {
      userIdToVerify = parseInt(userId);
    }

    const loginData = pendingLogins.get(userIdToVerify);

    if (!loginData) {
      console.log('❌ No pending login found for userId:', userIdToVerify);
      return res.status(400).json({ error: 'OTP expired or invalid. Please login again.' });
    }

    console.log('📝 Stored Login OTP Data:', {
      userId: userIdToVerify,
      storedOTP: loginData.otpCode,
      enteredOTP: otpCode,
      expiresAt: new Date(loginData.expiresAt),
      isExpired: loginData.expiresAt < Date.now()
    });

    // Check if OTP expired
    if (loginData.expiresAt < Date.now()) {
      pendingLogins.delete(userIdToVerify);
      clearTimeout(loginData.timeoutId);
      console.log('⏰ Login OTP expired for userId:', userIdToVerify);
      return res.status(400).json({ error: 'OTP expired. Please login again.' });
    }

    // Compare OTPs (both as strings)
    const storedOTP = String(loginData.otpCode);
    const enteredOTP = String(otpCode);
    
    console.log('🔐 Login OTP Comparison:', {
      storedOTP,
      enteredOTP,
      storedType: typeof loginData.otpCode,
      enteredType: typeof otpCode,
      match: storedOTP === enteredOTP
    });

    if (storedOTP !== enteredOTP) {
      console.log('❌ Login OTP mismatch!');
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    console.log('✅ Login OTP matched! Generating tokens...');

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

    // Clear timeout and remove from pending logins
    clearTimeout(loginData.timeoutId);
    pendingLogins.delete(userIdToVerify);

    console.log(`✅ User ${userDetails.username} logged in successfully`);

    res.json({
      message: 'Login successful',
      user: userDetails,
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error('Login OTP verification error:', error);
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