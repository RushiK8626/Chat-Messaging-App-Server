const multer = require('multer');
const path = require('path');
const fs = require('fs');

const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');

// S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined // if EC2 IAM role, credentials are automatically picked
});

// File Filter

const fileFilter = (req, file, cb) => {
  const blockedMimes = ['application/json', 'application/x-javascript', 'text/javascript'];

  if (blockedMimes.includes(file.mimetype)) {
    return cb(new Error(`File type ${file.mimetype} is not allowed for security reasons`), false);
  }

  cb(null, true);
};


// Conditional Storage (S3 or Local)
let storage;

if (process.env.USE_S3_UPLOAD === "true") {
  // ----------- S3 Storage -----------
  storage = multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET,
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      const nameWithoutExt = path.basename(file.originalname, ext);
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);

      cb(null, `uploads/${nameWithoutExt}-${uniqueSuffix}${ext}`);
    }
  });

} else {
  // ----------- Local Storage -----------
  const uploadsDir = path.join(__dirname, '../../uploads');

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const nameWithoutExt = path.basename(file.originalname, ext);

      cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
    }
  });
}

// Multer Instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// File Type Helper
const getFileTypeCategory = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.includes('pdf')) return 'pdf';
  if (mimetype.includes('word') || mimetype.includes('document')) return 'document';
  if (mimetype.includes('excel') || mimetype.includes('sheet')) return 'spreadsheet';
  if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return 'presentation';
  if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('7z')) return 'archive';
  return 'file';
};

module.exports = {
  upload,
  getFileTypeCategory
};