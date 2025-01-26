const express = require('express');
const router = express.Router();
const { getVideoMetadata } = require('../utils/youtube');

// Get video metadata
router.get('/metadata', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        const metadata = await getVideoMetadata(url);
        res.json(metadata);
    } catch (error) {
        console.error('Error fetching video metadata:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router; 