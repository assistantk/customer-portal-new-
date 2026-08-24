import { Router } from 'express';
import multer from 'multer';
import { scanPanDocument, scanGstinDocument } from '../controllers/documentController.js';
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
router.post('/pan/scan', upload.single('document'), scanPanDocument);
router.post('/gstin/scan', upload.single('document'), scanGstinDocument);
export default router;
//# sourceMappingURL=documentRoutes.js.map