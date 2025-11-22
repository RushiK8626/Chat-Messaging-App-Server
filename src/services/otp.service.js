const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const prisma = new PrismaClient();

// Initialize Twilio client (for SMS)
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Initialize email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Generate random OTP
const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

// Export generateOTP for use in other modules
exports.generateOTP = generateOTP;

// Create and store OTP
exports.createOTP = async (userId, otpType = 'login', txClient = null) => {
  try {
    // Ensure userId is a number
    const userIdInt = typeof userId === 'string' ? parseInt(userId) : userId;
    
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Use transaction client if provided, otherwise use global prisma
    const client = txClient || prisma;

    // Delete any existing OTPs for this user and type
    await client.otp.deleteMany({
      where: { user_id: userIdInt, otp_type: otpType }
    });

    // Create new OTP
    const otp = await client.otp.create({
      data: {
        user_id: userIdInt,
        otp_code: otpCode, // Already a string
        otp_type: otpType,
        expires_at: expiresAt
      }
    });

    return { otpCode, expiresAt };
    
  } catch (error) {
    console.error('Error creating OTP:', error);
    throw new Error('Failed to generate OTP');
  }
};

// Send OTP via Email
exports.sendOTPEmail = async (email, otpCode, otpType) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    let subject, message;

    if (otpType === 'register') {
      subject = 'Welcome to ConvoHub - Verify Your Account';
      message = `Welcome to ConvoHub! Your verification code is:`;
    } else if (otpType === 'login') {
      subject = 'ConvoHub Login Verification';
      message = `Your ConvoHub login verification code is:`;
    } else if (otpType === 'reset') {
      subject = 'ConvoHub Password Reset';
      message = `Your ConvoHub password reset OTP is:`;
    } else {
      subject = 'ConvoHub Verification Code';
      message = `Your ConvoHub verification code is:`;
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>${subject}</h2>
          <p>${message}</p>
          <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h1 style="color: #4CAF50; margin: 0; letter-spacing: 5px;">${otpCode}</h1>
          </div>
          <p>This code will expire in 5 minutes.</p>
          <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `
    });

  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

exports.sendOTP = async (user, otpCode, otpType) => {
  
  try {
    // Priority 1: Email (always works)
    if (user.email) {
      await this.sendOTPEmail(user.email, otpCode, otpType);
      return { success: true, method: 'email', destination: user.email };
    }
    
    // Priority 2: SMS (only in production)
    if (user.phone) {
      await this.sendOTPSMS(user.phone, otpCode, otpType);
      return { success: true, method: 'sms', destination: user.phone };
    }
    
    throw new Error('No valid contact method available');
    
  } catch (error) {
    console.error('Error sending OTP:', error.message);
    
    throw error;
  }
};

// Send OTP via SMS
exports.sendOTPSMS = async (phoneNumber, otpCode, otpType) => {

  // Real Twilio SMS (production only)
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const client = twilio(accountSid, authToken);
    
    const message = await client.messages.create({
      body: `Your ConvoHub verification code is: ${otpCode}. Valid for 5 minutes.`,
      from: twilioNumber,
      to: phoneNumber
    });

    return { success: true, sid: message.sid };

  } catch (error) {
    console.error('Error sending OTP SMS:', error);
    throw error;
  }
};

// Verify OTP
exports.verifyOTP = async (userId, otpCode, otpType = 'login') => {
  try {
    // Ensure userId is a number
    const userIdInt = typeof userId === 'string' ? parseInt(userId) : userId;
    
    // Get user info
    const user = await prisma.user.findUnique({
      where: { user_id: userIdInt }
    });

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Normal OTP verification - ensure types match
    const otp = await prisma.otp.findFirst({
      where: {
        user_id: userIdInt,
        otp_code: String(otpCode), // Ensure string comparison
        otp_type: otpType,
        expires_at: { gte: new Date() }
      }
    });

    if (!otp) {
      return { success: false, message: 'Invalid or expired OTP' };
    }

    await prisma.otp.delete({
      where: { otp_id: otp.otp_id }
    });

    return { success: true, message: 'OTP verified successfully' };

  } catch (error) {
    console.error('OTP verification error:', error);
    throw error;
  }
};

// Clean up expired OTPs (can be run periodically)
exports.cleanupExpiredOTPs = async () => {
  try {
    const result = await prisma.otp.deleteMany({
      where: {
        OR: [
          { expires_at: { lt: new Date() } },
          { verified: true }
        ]
      }
    });
    return result.count;
  } catch (error) {
    console.error('Error cleaning up OTPs:', error);
    throw new Error('Failed to cleanup OTPs');
  }
};