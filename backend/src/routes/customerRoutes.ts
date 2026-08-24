import { Router } from 'express';
import multer from 'multer';
import {
  getCustomer,
  createCustomer,
  updateCustomer,
} from '../controllers/customerController.js';
import {
  getCustomerGstins,
  createGstin,
  updateGstin,
  deleteGstin,
  getGstinFile,
} from '../controllers/gstinController.js';
import { uploadPanFile } from '../controllers/panController.js';

const router = Router({ mergeParams: true });

const storage = multer.memoryStorage();
const pdfOnly: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (file.mimetype !== 'application/pdf') {
    cb(new Error('Only PDF files are allowed'));
    return;
  }
  cb(null, true);
};
const singleUpload = multer({
  storage,
  fileFilter: pdfOnly,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
const multiUpload = multer({
  storage,
  fileFilter: pdfOnly,
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
});

router.get('/:customerCode', getCustomer);
router.get('/:customerCode/gstins', getCustomerGstins);
router.get('/:customerCode/gstins/:gstinId/file', getGstinFile);

router.post('/', multiUpload.array('gstinFiles', 20), createCustomer);
router.put('/:customerCode', updateCustomer);
router.put('/:customerCode/pan-file', singleUpload.single('panFile'), uploadPanFile);

router.post('/:customerCode/gstins', singleUpload.single('gstinFile'), createGstin);
router.put('/:customerCode/gstins/:gstinId', singleUpload.single('gstinFile'), updateGstin);
router.delete('/:customerCode/gstins/:gstinId', deleteGstin);

export default router;
