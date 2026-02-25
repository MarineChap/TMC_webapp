
let currentUser = null;
let isUserValidated = false;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initSupabaseAuth();
    initEditModal();
    startAutoReload();
    displayServerIP();
    fetchWeather();
});

let currentFlashNews = [];

async function displayServerIP() {
    try {
        const response = await fetch('/api/ip');
        if (response.ok) {
            const data = await response.json();
            const footer = document.querySelector('footer');
            if (footer) {
                const ipInfo = document.createElement('p');
                ipInfo.style.fontSize = '0.9em';
                ipInfo.style.color = '#666';
                ipInfo.style.marginTop = '5px';
                ipInfo.innerHTML = `Connecte à cette adresse: <strong>http://${data.ip}:${data.port}</strong>`;
                footer.appendChild(ipInfo);
            }
        }
    } catch (error) {
        console.error('Could not fetch server IP:', error);
    }
}

async function loadData() {
    try {
        const response = await fetch(`data/db.json?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        renderCarousel('chief-carousel', data.chiefMessages);
        renderCarousel('amicalist-carousel', data.amicalistMessages);
        renderRecruits(data.recruits);
        renderEvents(data.events);

        currentFlashNews = data.flashNews || [];
        renderFlashNews(currentFlashNews);

        // Initialize carousel logic after rendering
        initCarousel('chief-carousel');
        initCarousel('amicalist-carousel');

    } catch (error) {
        console.error('Could not load data:', error);
    }
}

let lastModifiedTime = 0;

function startAutoReload() {
    console.log('Starting auto-reload polling...');
    setInterval(async () => {
        try {
            const response = await fetch(`/api/last-modified?t=${new Date().getTime()}`);
            if (response.ok) {
                const data = await response.json();
                console.log(`Server mtime: ${data.last_modified}, Client mtime: ${lastModifiedTime}`);

                if (lastModifiedTime === 0) {
                    lastModifiedTime = data.last_modified;
                } else if (data.last_modified !== lastModifiedTime) {
                    console.log('Data changed, reloading...');
                    lastModifiedTime = data.last_modified;
                    loadData();
                }
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
        }
    }, 2000); // Check every 2 seconds
}

function renderCarousel(containerId, messages) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear existing slides except nav
    const existingSlides = container.querySelectorAll('.carousel-slide');
    existingSlides.forEach(slide => slide.remove());

    const nav = container.querySelector('.carousel-nav');

    messages.forEach((msg, index) => {
        const slide = document.createElement('div');
        slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`;

        let content = '';
        if (msg.image) {
            content += `<div style="display: flex; align-items: center; gap: 20px; text-align: left;">
                <img src="${msg.image}" alt="Image" style="max-width: 150px; max-height: 150px; object-fit: cover; border-radius: 5px;">
                <div>`;
        }

        content += `<blockquote>"${msg.text || msg.description || ''}"</blockquote>`;
        if (msg.author) {
            content += `<cite>- ${msg.author}</cite>`;
        } else if (msg.title) {
            content += `<cite><strong>${msg.title}</strong></cite>`;
        }

        if (msg.image) {
            content += `</div></div>`;
        }

        slide.innerHTML = content;
        container.insertBefore(slide, nav);
    });
}

function renderRecruits(recruits) {
    const grid = document.getElementById('recruits-grid');
    if (!grid) return;

    grid.innerHTML = recruits.map(recruit => `
        <div class="recruit-card">
            <img src="${recruit.image}" alt="${recruit.name}" style="background-color: #ccc;">
            <div class="recruit-info">
                <div class="recruit-name">${recruit.name}</div>
                <p>${recruit.description}</p>
            </div>
        </div>
    `).join('');
}

function renderEvents(events) {
    const container = document.getElementById('events-container');
    if (!container) return;

    container.innerHTML = events.map(event => `
        <div class="event-card">
            <div class="event-date">${event.date}</div>
            ${event.image ? `<img src="${event.image}" alt="${event.title}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 5px; margin-bottom: 10px;">` : ''}
            <h3>${event.title}</h3>
            <p>${event.description}</p>
        </div>
    `).join('');
}

function renderFlashNews(newsItems) {
    const container = document.getElementById('flash-news-container');
    const content = container.querySelector('.flash-news-content');
    if (!container || !content) return;

    if (!newsItems || newsItems.length === 0) {
        container.style.display = 'none';
        return;
    }

    const now = new Date();
    // Find the first valid news item
    const activeNews = newsItems.find(item => {
        const start = new Date(item.startTime);
        const end = new Date(item.endTime);
        return now >= start && now <= end;
    });

    if (activeNews) {
        content.textContent = activeNews.text;
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function initCarousel(carouselId) {
    const container = document.getElementById(carouselId);
    if (!container) return;

    const slides = container.querySelectorAll('.carousel-slide');
    if (slides.length === 0) return;

    const indicatorsContainer = container.querySelector('.carousel-indicators');
    let currentIndex = 0;
    let autoPlayInterval;

    // Generate Indicators
    if (indicatorsContainer) {
        indicatorsContainer.innerHTML = ''; // Clear existing
        slides.forEach((_, index) => {
            const indicator = document.createElement('div');
            indicator.className = `indicator ${index === 0 ? 'active' : ''}`;
            indicator.addEventListener('click', () => {
                currentIndex = index;
                showSlide(currentIndex);
                stopAutoPlay();
                startAutoPlay();
            });
            indicatorsContainer.appendChild(indicator);
        });
    }

    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.remove('active');
            if (i === index) {
                slide.classList.add('active');
            }
        });

        // Update indicators
        if (indicatorsContainer) {
            const indicators = indicatorsContainer.querySelectorAll('.indicator');
            indicators.forEach((ind, i) => {
                ind.classList.remove('active');
                if (i === index) {
                    ind.classList.add('active');
                }
            });
        }
    }

    function nextSlide() {
        currentIndex = (currentIndex + 1) % slides.length;
        showSlide(currentIndex);
    }

    function startAutoPlay() {
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        autoPlayInterval = setInterval(nextSlide, 5000);
    }

    function stopAutoPlay() {
        clearInterval(autoPlayInterval);
    }

    container.addEventListener('mouseenter', stopAutoPlay);
    container.addEventListener('mouseleave', startAutoPlay);

    showSlide(currentIndex);
    startAutoPlay();
}

/* --- Edit Modal Logic --- */

function initEditModal() {
    const modal = document.getElementById('edit-modal');
    const editBtn = document.getElementById('edit-btn');
    const closeBtn = document.querySelector('.close-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const saveBtn = document.getElementById('save-btn');
    const categorySelect = document.getElementById('category-select');
    const dynamicForm = document.getElementById('dynamic-form');

    if (!modal || !editBtn) return;

    // Open Edit Modal directly (auth is handled by button visibility/state)
    editBtn.addEventListener('click', () => {
        if (isUserValidated) {
            modal.style.display = 'block';
        } else {
            alert('Votre compte est en attente de validation.');
        }
    });

    // Close Modal
    function closeModal() {
        modal.style.display = 'none';
        categorySelect.value = "";
        dynamicForm.innerHTML = "";
        saveBtn.disabled = true;
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Will be handled globally or we can keep this, but let's be careful with multiple modals.
    // For now, keep it on modal itself.
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Handle Category Selection
    categorySelect.addEventListener('change', async (e) => {
        const category = e.target.value;
        dynamicForm.innerHTML = "";
        const existingItemsContainer = document.getElementById('existing-items-container');
        if (existingItemsContainer) existingItemsContainer.remove();

        if (category) {
            saveBtn.disabled = false;
            renderFormFields(category, dynamicForm);

            // Fetch and display existing items
            try {
                const response = await fetch(`data/db.json?t=${new Date().getTime()}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data[category]) {
                        renderExistingItems(category, data[category], dynamicForm);
                    }
                }
            } catch (error) {
                console.error('Error fetching existing items:', error);
            }
        } else {
            saveBtn.disabled = true;
        }
    });

    // Handle Save
    saveBtn.addEventListener('click', async () => {
        const category = categorySelect.value;
        if (!category) return;

        const formData = {};
        const inputs = dynamicForm.querySelectorAll('input, textarea');

        // Handle File Upload first if present
        const fileInput = dynamicForm.querySelector('input[type="file"]');
        let uploadedImagePath = '';

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            try {
                // Upload the file
                const uploadResponse = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
                    method: 'POST',
                    body: file // Send raw file content
                });

                if (uploadResponse.ok) {
                    const uploadData = await uploadResponse.json();
                    uploadedImagePath = uploadData.path;
                } else {
                    alert('Failed to upload image.');
                    return;
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                alert('Error uploading image.');
                return;
            }
        }

        inputs.forEach(input => {
            if (input.type === 'file') {
                if (uploadedImagePath) {
                    formData[input.name] = uploadedImagePath;
                }
                // If no file uploaded, maybe keep existing? For now, if required, validation will catch empty.
                // Or if it's an edit of existing item (not implemented yet fully for edit), we'd need to handle that.
                // For new item, if no file, it's empty string.
            } else {
                formData[input.name] = input.value;
            }
        });

        // Auto-set startTime for flashNews
        if (category === 'flashNews') {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            formData['startTime'] = `${year}-${month}-${day}T${hours}:${minutes}`;
        }

        // Auto-signature
        if (currentUser && currentUser.username) {
            if (category === 'chiefMessages' || category === 'amicalistMessages') {
                formData['author'] = currentUser.username;
            } else if (category === 'events' || category === 'recruits' || category === 'flashNews') {
                if (formData['description'] !== undefined) {
                    formData['description'] += `\n\n- ${currentUser.username}`;
                } else if (formData['text'] !== undefined) {
                    formData['text'] += `\n\n- ${currentUser.username}`;
                }
            }
        }

        // Basic Validation
        for (const key in formData) {
            if (!formData[key]) {
                alert('Remplissez tous les champs svp!');
                return;
            }
        }

        // Send to Server
        try {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    category: category,
                    item: formData
                })
            });

            if (response.ok) {
                alert('Item ajouté avec succés!');
                closeModal();
                loadData(); // Refresh UI
            } else {
                alert('Impossible d ajouter cette donnée.');
            }
        } catch (error) {
            console.error('Error saving data:', error);
            alert('Erreur en ajoutant les données.');
        }
    });
}

function renderFormFields(category, container) {
    let fields = [];

    switch (category) {
        case 'chiefMessages':
            fields = [
                { name: 'text', label: 'Message', type: 'textarea' },
                { name: 'author', label: 'Auteur (Groupe)', type: 'text' },
                { name: 'image', label: 'Image (Optional)', type: 'file' }
            ];
            break;
        case 'amicalistMessages':
            fields = [
                { name: 'text', label: 'Message', type: 'textarea' },
                { name: 'image', label: 'Image (Optional)', type: 'file' }
            ];
            break;
        case 'recruits':
            fields = [
                { name: 'name', label: 'Nom', type: 'text' },
                { name: 'image', label: 'Image', type: 'file' },
                { name: 'description', label: 'Description', type: 'textarea' }
            ];
            break;
        case 'events':
            fields = [
                { name: 'date', label: 'Date (e.g., 15 Decembre 2025, 17H00)', type: 'text' },
                { name: 'title', label: 'Titre', type: 'text' },
                { name: 'description', label: 'Description', type: 'textarea' },
                { name: 'image', label: 'Image (Optional)', type: 'file' }
            ];
            break;
        case 'flashNews':
            fields = [
                { name: 'text', label: 'Message Flash', type: 'textarea' },
                { name: 'endTime', label: 'Date de fin', type: 'datetime-local' }
            ];
            break;
    }

    const html = fields.map(field => `
        <div class="form-group">
            <label for="${field.name}">${field.label}</label>
            ${field.type === 'textarea'
            ? `<textarea id="${field.name}" name="${field.name}" rows="3"></textarea>`
            : `<input type="${field.type}" id="${field.name}" name="${field.name}" value="${field.value || ''}">`
        }
        </div>
    `).join('');

    container.innerHTML = html;
}

function renderExistingItems(category, items, container) {
    const listContainer = document.createElement('div');
    listContainer.id = 'existing-items-container';
    listContainer.style.marginTop = '20px';
    listContainer.style.borderTop = '1px solid #eee';
    listContainer.style.paddingTop = '10px';

    const title = document.createElement('h3');
    title.textContent = 'Liste des messages:';
    listContainer.appendChild(title);

    const list = document.createElement('ul');
    list.style.listStyle = 'none';
    list.style.padding = '0';

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '5px 0';
        li.style.borderBottom = '1px solid #f0f0f0';

        let label = '';
        if (item.title) label = item.title;
        else if (item.name) label = item.name;
        else if (item.text) label = item.text.substring(0, 30) + '...';

        const span = document.createElement('span');
        span.textContent = label;
        li.appendChild(span);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'X';
        deleteBtn.style.backgroundColor = '#ff4444';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.padding = '5px 10px';
        deleteBtn.style.borderRadius = '3px';
        deleteBtn.style.cursor = 'pointer';

        deleteBtn.addEventListener('click', async () => {
            if (confirm('Es tu sure de vouloir supprimer cet item?')) {
                await deleteItem(category, item);
            }
        });

        li.appendChild(deleteBtn);
        list.appendChild(li);
    });

    listContainer.appendChild(list);
    container.parentNode.insertBefore(listContainer, container.nextSibling);
}

async function deleteItem(category, item) {
    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                category: category,
                item: item
            })
        });

        if (response.ok) {
            alert('Item supprimé!');
            // Refresh the list
            const categorySelect = document.getElementById('category-select');
            categorySelect.dispatchEvent(new Event('change'));
            loadData(); // Refresh main view
        } else {
            alert('Impossible de supprimer cet item.');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        alert('Erreur en supprimant cet item.');
    }
}

/* --- Weather Widget Logic --- */

async function fetchWeather() {
    const container = document.getElementById('weather-container');
    if (!container) return;

    // Taluyers coordinates
    const lat = 45.641;
    const lon = 4.722;

    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`);
        if (!response.ok) throw new Error('Weather API failed');
        const data = await response.json();

        const daily = data.daily;
        const days = ['Auj.', 'Dem.'];

        let html = '';
        for (let i = 0; i < 2; i++) {
            const code = daily.weathercode[i];
            const maxTemp = Math.round(daily.temperature_2m_max[i]);
            const minTemp = Math.round(daily.temperature_2m_min[i]);
            const icon = getWeatherIcon(code);
            const desc = getWeatherDesc(code);

            html += `
                <div class="weather-day">
                    <div class="weather-date">${days[i]}</div>
                    <div class="weather-icon" title="${desc}">${icon}</div>
                    <div class="weather-temp">${minTemp}° / ${maxTemp}°</div>
                    <!-- <div class="weather-desc">${desc}</div> -->
                </div>
            `;
        }

        container.innerHTML = html;

    } catch (error) {
        console.error('Error fetching weather:', error);
        container.innerHTML = '<div class="weather-loading">Météo indisponible</div>';
    }
}

function getWeatherIcon(code) {
    // WMO Weather interpretation codes (WW)
    // 0: Clear sky
    // 1, 2, 3: Mainly clear, partly cloudy, and overcast
    // 45, 48: Fog and depositing rime fog
    // 51, 53, 55: Drizzle: Light, moderate, and dense intensity
    // 56, 57: Freezing Drizzle: Light and dense intensity
    // 61, 63, 65: Rain: Slight, moderate and heavy intensity
    // 66, 67: Freezing Rain: Light and heavy intensity
    // 71, 73, 75: Snow fall: Slight, moderate, and heavy intensity
    // 77: Snow grains
    // 80, 81, 82: Rain showers: Slight, moderate, and violent
    // 85, 86: Snow showers slight and heavy
    // 95: Thunderstorm: Slight or moderate
    // 96, 99: Thunderstorm with slight and heavy hail

    if (code === 0) return '☀️';
    if (code >= 1 && code <= 3) return '⛅';
    if (code >= 45 && code <= 48) return '🌫️';
    if (code >= 51 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 85 && code <= 86) return '🌨️';
    if (code >= 95 && code <= 99) return '⛈️';
    return '❓';
}

function getWeatherDesc(code) {
    if (code === 0) return 'Ensoleillé';
    if (code >= 1 && code <= 3) return 'Nuageux';
    if (code >= 45 && code <= 48) return 'Brouillard';
    if (code >= 51 && code <= 67) return 'Pluie';
    if (code >= 71 && code <= 77) return 'Neige';
    if (code >= 80 && code <= 82) return 'Averses';
    if (code >= 85 && code <= 86) return 'Averses de neige';
    if (code >= 95 && code <= 99) return 'Orage';
    return 'Inconnu';
}

/* --- Supabase Auth Logic --- */

async function initSupabaseAuth() {
    const token = localStorage.getItem('access_token');
    if (token) {
        try {
            const response = await fetch('/api/auth/session', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                handleSession(data.user);
            } else {
                localStorage.removeItem('access_token');
                updateAuthUI();
            }
        } catch (error) {
            console.error('Session check failed', error);
            updateAuthUI();
        }
    } else {
        updateAuthUI();
    }
    setupAuthModals();
}

function handleSession(user) {
    currentUser = user;
    isUserValidated = user.is_validated;
    updateAuthUI();
}

function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const editBtn = document.getElementById('edit-btn');

    if (currentUser) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (signupBtn) signupBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';

        if (isUserValidated) {
            if (editBtn) {
                editBtn.style.display = 'block';
                editBtn.disabled = false;
                editBtn.title = '';
                editBtn.style.opacity = '1';
                editBtn.style.cursor = 'pointer';
            }
        } else {
            if (editBtn) {
                editBtn.style.display = 'block';
                editBtn.title = 'Compte en attente de validation';
            }
        }
    } else {
        if (loginBtn) loginBtn.style.display = 'block';
        if (signupBtn) signupBtn.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
    }
}

function setupAuthModals() {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');

    const loginModal = document.getElementById('login-modal');
    const signupModal = document.getElementById('signup-modal');

    // Login Elements
    const loginSubmit = document.getElementById('login-submit-btn');
    const loginCancel = document.getElementById('login-cancel-btn');
    const loginClose = document.querySelector('.close-login-btn');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');

    // Signup Elements
    const signupSubmit = document.getElementById('signup-submit-btn');
    const signupCancel = document.getElementById('signup-cancel-btn');
    const signupClose = document.querySelector('.close-signup-btn');
    const signupUsernameInput = document.getElementById('signup-username');
    const signupPasswordInput = document.getElementById('signup-password');

    if (loginBtn) loginBtn.addEventListener('click', () => { loginModal.style.display = 'block'; });
    if (signupBtn) signupBtn.addEventListener('click', () => { signupModal.style.display = 'block'; });
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('access_token');
        currentUser = null;
        isUserValidated = false;
        updateAuthUI();
    });

    const closeLogin = () => { loginModal.style.display = 'none'; loginUsernameInput.value = ''; loginPasswordInput.value = ''; };
    const closeSignup = () => { signupModal.style.display = 'none'; signupUsernameInput.value = ''; signupPasswordInput.value = ''; };

    if (loginCancel) loginCancel.addEventListener('click', closeLogin);
    if (loginClose) loginClose.addEventListener('click', closeLogin);

    if (signupCancel) signupCancel.addEventListener('click', closeSignup);
    if (signupClose) signupClose.addEventListener('click', closeSignup);

    window.addEventListener('click', (event) => {
        if (event.target === loginModal) closeLogin();
        if (event.target === signupModal) closeSignup();
    });

    // Handle Login
    if (loginSubmit) loginSubmit.addEventListener('click', async () => {
        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value;
        if (!username || !password) return alert("Veuillez remplir tous les champs.");

        loginSubmit.disabled = true;
        loginSubmit.textContent = 'Connexion...';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('access_token', data.access_token);
                handleSession(data.user);
                closeLogin();
            } else {
                const err = await response.json();
                alert('Erreur de connexion : ' + err.detail);
            }
        } catch (error) {
            alert('Erreur de réseau.');
        }

        loginSubmit.disabled = false;
        loginSubmit.textContent = 'Se connecter';
    });

    // Handle Signup
    if (signupSubmit) signupSubmit.addEventListener('click', async () => {
        const username = signupUsernameInput.value.trim();
        const password = signupPasswordInput.value;
        if (!username || !password) return alert("Veuillez remplir tous les champs.");
        if (password.length < 6) return alert("Le mot de passe doit faire au moins 6 caractères.");

        signupSubmit.disabled = true;
        signupSubmit.textContent = 'Inscription...';

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                alert("Inscription réussie ! Un administrateur doit maintenant valider votre compte.");
                closeSignup();
            } else {
                const err = await response.json();
                alert('Erreur: ' + err.detail);
            }
        } catch (error) {
            alert('Erreur de réseau.');
        }

        signupSubmit.disabled = false;
        signupSubmit.textContent = "S'inscrire";
    });
}
