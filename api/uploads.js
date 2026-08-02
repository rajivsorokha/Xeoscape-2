// api/uploads.js
// Generic image upload endpoint used by the product form's "Picture"
// field. Stores files under data/uploads and returns a URL the
// frontend can save as a product's imageUrl.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const VALID_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB, matching PharmaSpot's real limit

function buildUploadsRouter({ dataDir }) {
  const router = express.Router();
  const uploadsDir = path.join(dataDir, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const unique = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}-${unique}${path.extname(file.originalname)}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      if (!VALID_MIME_TYPES.includes(file.mimetype)) {
        return cb(new Error('Only JPG, PNG, and WEBP images are allowed.'));
      }
      cb(null, true);
    }
  }).single('image');

  router.post('/image', (req, res) => {
    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
      }
      res.status(201).json({ url: `/uploads/${req.file.filename}` });
    });
  });

  return { router, uploadsDir };
}

module.exports = buildUploadsRouter;
