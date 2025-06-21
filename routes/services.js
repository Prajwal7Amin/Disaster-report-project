// routes/services.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { supabase } from '../supabaseClient.js';

dotenv.config();
const router = express.Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const Maps_API_KEY = process.env.Maps_API_KEY; // [FIX] Corrected variable name

// Endpoint to handle geocoding process with caching
router.post('/geocode', async (req, res) => {
    const { description } = req.body;

    if (!description) {
        return res.status(400).json({ error: 'Description is required.' });
    }

    const cacheKey = `geocode:${description.replace(/\s/g, '_').toLowerCase()}`;

    try {
        // Check for a valid cache entry first
        const { data: cachedData, error: cacheError } = await supabase
            .from('cache')
            .select('value')
            .eq('key', cacheKey)
            .gte('expires_at', new Date().toISOString())
            .single();

        if (cacheError && cacheError.code !== 'PGRST116') { // Ignore 'No rows found' error
            console.error('Cache read error:', cacheError);
        }
        
        if (cachedData) {
            console.log('--- Serving from CACHE ---');
            return res.status(200).json(cachedData.value);
        }

        console.log('--- Cache miss, fetching from APIs ---');
        // Extract Location Name using Gemini API ---
        const geminiPrompt = `Extract the most specific city, state, or well-known location from the following text. Respond with only the location name and nothing else. For example, for "flooding near the Eiffel Tower in Paris", respond "Eiffel Tower, Paris". Text: "${description}"`;
        
        const geminiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: geminiPrompt }] }] }
        );
        
        const extractedLocation = getGeminiText(geminiResponse);
        
        // Completed error handling
        if (!extractedLocation) {
            return res.status(500).json({ error: 'Could not extract location from description using Gemini.' });
        }

        // Convert Location Name to Coordinates using Google Maps ---
        // Completed the API call
        const geocodingResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: extractedLocation,
                key: Maps_API_KEY
            }
        });

        // Completed error handling
        if (geocodingResponse.data.status !== 'OK' || geocodingResponse.data.results.length === 0) {
            console.error('Geocoding API Error:', geocodingResponse.data);
            return res.status(404).json({ error: 'Could not find coordinates for the extracted location.', location: extractedLocation });
        }
        
        const coordinates = geocodingResponse.data.results[0].geometry.location; // { lat, lng }
        const result = { extractedLocation, coordinates };

        // Save the new result to the cache before responding
        const expires_at = new Date(Date.now() + 60 * 60 * 1000); // Expires in 1 hour
        const { error: insertError } = await supabase
            .from('cache')
            .upsert({
                key: cacheKey,
                value: result,
                expires_at: expires_at.toISOString()
            });

        if (insertError) {
            console.error('Cache write error:', insertError);
        }

        res.status(200).json(result);

    } catch (error) {
        console.error('Geocoding process failed:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'An error occurred during the geocoding process.' });
    }
});


// Helper function to extract text from the Gemini API response
const getGeminiText = (response) => {
    try {
       return response.data.candidates[0].content.parts[0].text.trim();
   } catch (e) {
       console.error("Could not extract text from Gemini response:", response.data);
       return null;
   }
}

export default router;