// routes/disasters.js
import express from 'express';
import { supabase } from '../supabaseClient.js';


const router = express.Router();

// CRUD 

// CREATE a new disaster
router.post('/', async (req, res) => {
  const { title, description, location_name, tags, owner_id } = req.body;

  // Basic validation
  if (!title || !owner_id) {
    return res.status(400).json({ error: 'Title and owner_id are required.' });
  }

  // Create the initial audit trail entry
  const audit_trail = [{
    action: 'create',
    user_id: owner_id,
    timestamp: new Date().toISOString()
  }];

  const { data, error } = await supabase
    .from('disasters')
    .insert([{ title, description, location_name, tags, owner_id, audit_trail }])
    .select() // Return the newly created record
    .single(); // Return as a single object instead of an array

  if (error) {
    console.error('Error creating disaster:', error);
    return res.status(500).json({ error: error.message });
  }

  // [SOCKET] Emit event after successful creation
  req.io.emit('disaster_updated', { action: 'create', data: data });

  res.status(201).json(data);
});

// READ all disasters (with optional tag filtering)
router.get('/', async (req, res) => {
  const { tag } = req.query;

  let query = supabase.from('disasters').select('*').order('created_at', { ascending: false });

  // If a tag query parameter is present, filter by it
  if (tag) {
    query = query.contains('tags', [tag]);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching disasters:', error);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json(data);
});

// READ a single disaster by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('disasters')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching disaster:', error);
    return res.status(500).json({ error: 'Error fetching disaster' });
  }

  if (!data) {
    return res.status(404).json({ error: 'Disaster not found' });
  }

  res.status(200).json(data);
});


// UPDATE a disaster by ID
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, tags } = req.body;
    const user_id = req.headers['x-user-id'] || 'reliefAdmin'; // Mock user from header

    // First, fetch the existing record to get the current audit trail
    const { data: existingDisaster, error: fetchError } = await supabase
        .from('disasters')
        .select('audit_trail')
        .eq('id', id)
        .single();
    
    if (fetchError || !existingDisaster) {
        return res.status(404).json({ error: 'Disaster not found to update.' });
    }

    // Prepare the new audit entry and append it
    const newAuditEntry = {
        action: 'update',
        user_id: user_id,
        timestamp: new Date().toISOString(),
        changes: req.body // Log what was changed
    };
    const updated_audit_trail = [...(existingDisaster.audit_trail || []), newAuditEntry];

    // Perform the update
    const { data, error } = await supabase
        .from('disasters')
        .update({ title, description, tags, audit_trail: updated_audit_trail })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating disaster:', error);
        return res.status(500).json({ error: error.message });
    }
    
    // [SOCKET] Emit event after successful update
    req.io.emit('disaster_updated', { action: 'update', data: data });

    res.status(200).json(data);
});


// 5. DELETE a disaster by ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userRole = req.headers['x-user-role']; // Mock role check

  // Mock authorization
  if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only admins can delete disasters.' });
  }

  const { error } = await supabase
    .from('disasters')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting disaster:', error);
    return res.status(500).json({ error: error.message });
  }

  // [SOCKET] Emit event after successful deletion
  req.io.emit('disaster_updated', { action: 'delete', data: { id: id } });

  res.status(204).send(); // 204 No Content is a standard response for successful deletion
});


// Get mock social media reports for a disaster
router.get('/:id/social-media', async (req, res) => {
  const { id } = req.params;
  const cacheKey = `social-media:${id}`;

  try {
      // Check cache first
      const { data: cachedData } = await supabase
          .from('cache')
          .select('value')
          .eq('key', cacheKey)
          .gte('expires_at', new Date().toISOString())
          .single();

      if (cachedData) {
          console.log(`--- Serving social media for ${id} from CACHE ---`);
          return res.status(200).json(cachedData.value);
      }

      console.log(`--- Cache miss for social media, generating MOCK data for ${id} ---`);
      // If no cache, generate mock data
      const mockPosts = [
          { user: 'citizen_jane', post: `Just felt a huge tremor near downtown! Everyone okay? #earthquake` },
          { user: 'helper_bot', post: `Official Update: An earthquake of magnitude 5.8 has been reported. Stay clear of damaged structures.` },
          { user: 'local_news', post: `We're getting reports of power outages in the western suburbs following the quake.` },
          { user: 'concerned_sam', post: `My building was shaking like crazy. Is there a shelter nearby? Need info!` },
      ];

      // Save to cache
      const expires_at = new Date(Date.now() + 5 * 60 * 1000); // Expires in 5 minutes
      await supabase.from('cache').upsert({
          key: cacheKey,
          value: mockPosts,
          expires_at: expires_at.toISOString()
      });

      res.status(200).json(mockPosts);

  } catch (error) {
    // It's better to check for the specific 'no rows' error code from PostgREST
    if (error.code === 'PGRST116') {
        
        
    } else {
        console.error('Error fetching social media:', error);
        return res.status(500).json({ error: 'Failed to fetch social media data.' });
    }
  }
});



export default router;