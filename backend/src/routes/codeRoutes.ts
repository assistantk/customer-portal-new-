import { Router } from 'express';
import {
  generateGlobalCode,
  generateHandlingCode,
} from '../controllers/codeController.js';

const router = Router();

router.post('/generate-global', generateGlobalCode);
router.post('/generate-handling', generateHandlingCode);

export default router;
