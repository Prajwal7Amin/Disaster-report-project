document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let disasters = [];
    let selectedDisasterId = null;

    // --- CONFIG ---
    const API_URL = 'http://localhost:3001/api';

    // --- ELEMENT REFERENCES ---
    const disastersList = document.getElementById('disasters-list');
    const selectedDisasterContainer = document.getElementById('selected-disaster');
    const disasterForm = document.getElementById('disaster-form');
    const reportForm = document.getElementById('report-form');
    const socialMediaFeed = document.getElementById('social-media-feed');
    const eventLog = document.getElementById('event-log');
    const reportsList = document.getElementById('reports-list');

    // --- API FUNCTIONS ---
    const api = {
        getDisasters: () => fetch(`${API_URL}/disasters`).then(res => res.json()),
        createDisaster: (body) => fetch(`${API_URL}/disasters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        updateDisaster: (id, body) => fetch(`${API_URL}/disasters/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        deleteDisaster: (id) => fetch(`${API_URL}/disasters/${id}`, { method: 'DELETE', headers: { 'x-user-role': 'admin' } }),
        getSocialMedia: (id) => fetch(`${API_URL}/disasters/${id}/social-media`).then(res => res.json()),
        createReport: (body) => fetch(`${API_URL}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        verifyReportImage: (id) => fetch(`${API_URL}/reports/${id}/verify`, { method: 'POST' }),
    };

    // --- RENDER FUNCTIONS ---
    function renderDisasters() {
        disastersList.innerHTML = '';
        disasters.forEach(disaster => {
            const li = document.createElement('li');
            li.textContent = disaster.title;
            li.dataset.id = disaster.id;
            if (disaster.id === selectedDisasterId) {
                li.classList.add('selected');
            }
            disastersList.appendChild(li);
        });
    }

    function renderSelectedDisaster() {
        const disaster = disasters.find(d => d.id === selectedDisasterId);
        if (disaster) {
            selectedDisasterContainer.innerHTML = `
                <h4>${disaster.title}</h4>
                <p><strong>Description:</strong> ${disaster.description || 'N/A'}</p>
                <p><strong>Location:</strong> ${disaster.location_name || 'N/A'}</p>
                <p><strong>Tags:</strong> ${disaster.tags?.join(', ') || 'None'}</p>
                <button data-action="edit" data-id="${disaster.id}">Edit</button>
                <button data-action="delete" data-id="${disaster.id}">Delete</button>
            `;
            reportForm.classList.remove('hidden');
            renderReports(disaster.reports || []);
            loadSocialMedia(disaster.id);
        } else {
            selectedDisasterContainer.innerHTML = '<p>Select a disaster from the list.</p>';
            reportForm.classList.add('hidden');
            socialMediaFeed.innerHTML = '<p>Select a disaster to see social media feed.</p>';
            reportsList.innerHTML = '';
        }
    }
    
    function renderReports(reports) {
        reportsList.innerHTML = '';
        reports.forEach(report => {
            const li = document.createElement('li');
            li.className = 'report-item';
            li.innerHTML = `
                <p>${report.content}</p>
                <small>Status: <strong>${report.verification_status}</strong></small>
                ${report.image_url && report.verification_status === 'pending' ? `<button data-action="verify" data-id="${report.id}">Verify Image</button>` : ''}
            `;
            reportsList.appendChild(li);
        });
    }

    async function loadSocialMedia(disasterId) {
        const posts = await api.getSocialMedia(disasterId);
        socialMediaFeed.innerHTML = posts.map(p => `<p><strong>@${p.user}:</strong> ${p.post}</p>`).join('');
    }

    // --- EVENT LISTENERS ---
    disastersList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            selectedDisasterId = e.target.dataset.id;
            loadInitialData();
        }
    });

    selectedDisasterContainer.addEventListener('click', async (e) => {
        const { action, id } = e.target.dataset;
        if (action === 'delete') {
            if (confirm('Are you sure you want to delete this disaster?')) {
                await api.deleteDisaster(id);
                // Real-time update will handle re-render
            }
        }
        if (action === 'edit') {
            const disaster = disasters.find(d => d.id === id);
            document.getElementById('disaster-id').value = disaster.id;
            document.getElementById('disaster-title').value = disaster.title;
            document.getElementById('disaster-description').value = disaster.description;
            document.getElementById('disaster-tags').value = disaster.tags?.join(',');
        }
    });

    reportsList.addEventListener('click', async (e) => {
        const { action, id } = e.target.dataset;
        if (action === 'verify') {
            e.target.textContent = 'Verifying...';
            e.target.disabled = true;
            await api.verifyReportImage(id);
            // Real-time update will handle re-render
        }
    });

    disasterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('disaster-id').value;
        const body = {
            title: document.getElementById('disaster-title').value,
            description: document.getElementById('disaster-description').value,
            tags: document.getElementById('disaster-tags').value.split(',').map(t => t.trim()),
            owner_id: 'frontendAdmin'
        };
        if (id) {
            await api.updateDisaster(id, body);
        } else {
            await api.createDisaster(body);
        }
        disasterForm.reset();
        document.getElementById('disaster-id').value = '';
        // Real-time update will handle re-render
    });

    document.getElementById('clear-form-btn').addEventListener('click', () => {
        disasterForm.reset();
        document.getElementById('disaster-id').value = '';
    });

    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedDisasterId) return alert('Please select a disaster first.');
        const body = {
            disaster_id: selectedDisasterId,
            content: document.getElementById('report-content').value,
            image_url: document.getElementById('report-image-url').value,
            user_id: 'frontendUser'
        };
        await api.createReport(body);
        reportForm.reset();
        // Real-time update will handle re-render
    });


    // --- WEBSOCKETS ---
    const socket = io("http://localhost:3001");
    socket.on("connect", () => document.getElementById('ws-status').textContent = 'Connected');
    socket.on("disconnect", () => document.getElementById('ws-status').textContent = 'Disconnected');

    socket.on('disaster_updated', (payload) => {
        logEvent('disaster_updated', payload);
        loadInitialData(); // Re-fetch all data on any disaster change
    });
    
    socket.on('new_report', (newReport) => {
        logEvent('new_report', newReport);
        const disaster = disasters.find(d => d.id === newReport.disaster_id);
        if (disaster) {
            disaster.reports = disaster.reports ? [...disaster.reports, newReport] : [newReport];
            renderSelectedDisaster();
        }
    });
    
    function logEvent(name, payload) {
        eventLog.innerHTML = `<p><strong>[${name}]</strong> ${JSON.stringify(payload)}</p>` + eventLog.innerHTML;
    }

    // --- INITIALIZATION ---
    async function loadInitialData() {
        disasters = await api.getDisasters();
        // A full implementation would fetch reports for each disaster, but we'll do it on select for now
        renderDisasters();
        renderSelectedDisaster();
    }

    loadInitialData();
});