// routes/reports.js
import express from 'express';
import axios from 'axios';
import { supabase } from '../supabaseClient.js';

const router = express.Router();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// CREATE a new report for a specific disaster
router.post('/', async (req, res) => {
    const { disaster_id, user_id, content, image_url } = req.body;

    if (!disaster_id || !content) {
        return res.status(400).json({ error: 'Disaster ID and content are required.' });
    }

    const { data, error } = await supabase
        .from('reports')
        .insert([{ disaster_id, user_id, content, image_url }])
        .select()
        .single();

    if (error) {
        console.error('Error creating report:', error);
        return res.status(500).json({ error: 'Failed to create report.' });
    }

    // [SOCKET] Emit event after successful creation
    req.io.emit('new_report', data);

    res.status(201).json(data);
});


// VERIFY an image for a specific report
router.post('/:id/verify', async (req, res) => {
    const { id } = req.params; // This is the report ID

    // Get the report from the database to find its image_url
    const { data: report, error: fetchError } = await supabase
        .from('reports')
        .select('image_url')
        .eq('id', id)
        .single();
    
    if (fetchError || !report || !report.image_url) {
        return res.status(404).json({ error: 'Report with a valid image URL not found.' });
    }
    
    // Call Gemini Vision API to analyze the image
    try {
        const prompt = "Analyze this image. Is it a real photo of a disaster (like a flood, fire, earthquake)? Does it show signs of being AI-generated or digitally manipulated? Please respond with a single word based on your analysis: 'verified', 'fake', or 'unclear'.";

        const geminiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY}`,
            {
                "contents": [{
                    "parts": [
                        { "text": prompt },
                        { "inline_data": { "mime_type": "image/jpeg", "data": await urlToGenerativePart(report.image_url) } }
                    ]
                }]
            }
        );
        
        const resultText = geminiResponse.data.candidates[0].content.parts[0].text.trim().toLowerCase();
        let verification_status = 'unclear';
        if (resultText.includes('verified')) {
            verification_status = 'verified';
        } else if (resultText.includes('fake')) {
            verification_status = 'fake';
        }

        // 3. Update the report's status in the database
        const { data: updatedReport, error: updateError } = await supabase
            .from('reports')
            .update({ verification_status })
            .eq('id', id)
            .select()
            .single();
        
        if (updateError) throw updateError;

        res.status(200).json(updatedReport);

    } catch (error) {
        console.error('Image verification failed:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'An error occurred during image verification.' });
    }
});




// Helper function to fetch an image from a URL and convert it to base64
async function urlToGenerativePart(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary').toString('base64');
}


export default router;