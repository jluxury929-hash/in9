
import { Router } from 'express';
import { flashbotsExecutor } from '../index';
import logger from '../utils/logger';

const router = Router();

// Get MEV opportunities
router.get('/opportunities', async (req, res) => {
  try {
    if (!flashbotsExecutor) {
      return res.status(503).json({
        success: false,
        error: 'Flashbots MEV executor not available'
      });
    }

    const opportunities = await flashbotsExecutor.scanMEVOpportunities();
    res.json({
      success: true,
      data: opportunities,
      count: opportunities.length
    });
  } catch (error) {
    logger.error('MEV opportunities endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan MEV opportunities'
    });
  }
});

// Create sandwich bundle
router.post('/sandwich', async (req, res) => {
  try {
    const { targetTx, amountIn } = req.body;
    
    if (!flashbotsExecutor) {
      return res.status(503).json({
        success: false,
        error: 'Flashbots MEV executor not available'
      });
    }

    if (!targetTx || !amountIn) {
      return res.status(400).json({
        success: false,
        error: 'targetTx and amountIn are required'
      });
    }

    const bundle = await flashbotsExecutor.createSandwichBundle(targetTx, amountIn);
    
    if (!bundle) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create sandwich bundle'
      });
    }

    res.json({
      success: true,
      data: bundle
    });
  } catch (error) {
    logger.error('Sandwich bundle endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create sandwich bundle'
    });
  }
});

// Execute bundle
router.post('/execute', async (req, res) => {
  try {
    const { transactions, blockNumber } = req.body;
    
    if (!flashbotsExecutor) {
      return res.status(503).json({
        success: false,
        error: 'Flashbots MEV executor not available'
      });
    }

    const success = await flashbotsExecutor.executeBundle({
      transactions,
      blockNumber
    });

    res.json({
      success,
      message: success ? 'Bundle executed successfully' : 'Bundle execution failed'
    });
  } catch (error) {
    logger.error('Bundle execution endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute bundle'
    });
  }
});

// Get bundle stats
router.get('/bundle/:bundleHash/stats', async (req, res) => {
  try {
    const { bundleHash } = req.params;
    
    if (!flashbotsExecutor) {
      return res.status(503).json({
        success: false,
        error: 'Flashbots MEV executor not available'
      });
    }

    const stats = await flashbotsExecutor.getBundleStats(bundleHash);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Bundle stats endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bundle stats'
    });
  }
});

// MEV status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      mevEnabled: flashbotsExecutor !== null,
      service: 'Flashbots MEV',
      version: '1.0.0'
    }
  });
});

export default router;
