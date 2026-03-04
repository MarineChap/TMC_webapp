import { SdmisNewsCarousel } from './sdmisCarousel';

let currentUser: any = null;
let isUserValidated = false;

interface CarouselItem {
    text?: string;
    description?: string;
    author?: string;
    title?: string;
    image?: string;
    name?: string;
}

interface EventItem {
    date: string;
    title: string;
    description: string;
    image?: string;
}

interface FlashNewsItem {
    text: string;
    startTime: string;
    endTime: string;
}

interface DbData {
    chiefMessages: CarouselItem[];
    amicalistMessages: CarouselItem[];
    recruits: CarouselItem[];
    events: EventItem[];
    flashNews: FlashNewsItem[];
}

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initSupabaseAuth();
    initEditModal();
    startAutoReload();
    displayServerIP();
    fetchWeather();
    checkInitialLogsRoute();

    // Initialize SDMIS Carousel
    const sdmisCarousel = new SdmisNewsCarousel('sdmis-carousel');
    sdmisCarousel.init();
});

async function checkInitialLogsRoute() {
    if (window.location.pathname === '/logs') {
        // Wait for session init
        setTimeout(() => {
            if (currentUser && isUserValidated) {
                const logsBtn = document.getElementById('logs-btn');
                if (logsBtn) logsBtn.click();
            }
        }, 1000);
    }
}

let currentFlashNews: FlashNewsItem[] = [];

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
                ipInfo.innerHTML = `Connectez vous à cette adresse: <strong>http://${data.ip}:5173</strong>`;
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
        const data: DbData = await response.json();

        renderCarousel('chief-carousel', data.chiefMessages);
        renderCarousel('amicalist-carousel', data.amicalistMessages);
        renderCarousel('recruits-carousel', data.recruits, true); // True for recruits specific rendering
        renderEvents(data.events);

        currentFlashNews = data.flashNews || [];
        renderFlashNews(currentFlashNews);

        // Initialize carousel logic after rendering
        initCarousel('chief-carousel');
        initCarousel('amicalist-carousel');
        initCarousel('recruits-carousel');

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

function renderCarousel(containerId: string, messages: CarouselItem[], isRecruit: boolean = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear existing slides except nav
    const existingSlides = container.querySelectorAll('.carousel-slide');
    existingSlides.forEach(slide => slide.remove());

    const indicators = container.querySelector('.carousel-indicators');

    if (isRecruit) {
        // Group recruits into chunks of 6 for the TV display
        const chunkSize = 6;
        const chunks: CarouselItem[][] = [];
        for (let i = 0; i < messages.length; i += chunkSize) {
            chunks.push(messages.slice(i, i + chunkSize));
        }

        chunks.forEach((chunk, index) => {
            const slide = document.createElement('div');
            slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`;

            slide.innerHTML = `
                <div class="recruits-grid-mini" style="display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; gap: 1vh; height: 100%; width: 100%;">
                    ${chunk.map(msg => `
                        <div class="recruit-card" style="height: 100%; display: flex; flex-direction: column; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                            <img src="${msg.image}" alt="${msg.name}" style="width: 100%; height: 11vh; object-fit: cover;">
                            <div class="recruit-info" style="padding: 0.8vh; text-align: center; flex: 1; display: flex; flex-direction: column; justify-content: center;">
                                <div class="recruit-name" style="font-size: clamp(1rem, 1.2vw, 1.3rem); font-weight: 700; color: var(--primary-red); line-height: 1.1; margin-bottom: 0.3vh;">${msg.name}</div>
                                <p style="font-size: clamp(0.7rem, 0.9vw, 1rem); margin-top: 0; line-height: 1.1; opacity: 0.8;">${msg.description}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            if (indicators) {
                container.insertBefore(slide, indicators);
            } else {
                container.appendChild(slide);
            }
        });
    } else {
        messages.forEach((msg: CarouselItem, index: number) => {
            const slide = document.createElement('div');
            slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`;

            let content = '';
            if (msg.image) {
                content = `
                    <div class="carousel-slide-content">
                        <div class="carousel-text-content">
                            <blockquote style="font-size: 1.5rem;">"${msg.text || msg.description || ''}"</blockquote>
                            ${msg.author ? `<cite>- ${msg.author}</cite>` : (msg.title ? `<cite><strong>${msg.title}</strong></cite>` : '')}
                        </div>
                        <img src="${msg.image}" alt="Image" class="carousel-big-image">
                    </div>
                `;
            } else {
                content += `<blockquote style="font-size: 1.5rem;">"${msg.text || msg.description || ''}"</blockquote>`;
                if (msg.author) {
                    content += `<cite>- ${msg.author}</cite>`;
                } else if (msg.title) {
                    content += `<cite><strong>${msg.title}</strong></cite>`;
                }
            }

            slide.innerHTML = content;
            if (indicators) {
                container.insertBefore(slide, indicators);
            } else {
                container.appendChild(slide);
            }
        });
    }
}

function renderRecruits(recruits: CarouselItem[]) {
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

function renderEvents(events: EventItem[]) {
    const container = document.getElementById('events-container');
    if (!container) return;

    // Clear existing content and indicators
    container.innerHTML = '';
    const section = container.closest('.future-event');
    let indicators = section?.querySelector('.carousel-indicators');
    if (indicators) indicators.innerHTML = '';

    if (!events || events.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.7;">Aucun événement prévu.</p>';
        return;
    }

    // Group events into chunks of 2
    const pages: EventItem[][] = [];
    for (let i = 0; i < events.length; i += 2) {
        pages.push(events.slice(i, i + 2));
    }

    console.log(`[Events] Total pages: ${pages.length}`, pages);

    if (pages.length === 1 && pages[0].length === 1) {
        // Single page rendering (only 1 event total)
        container.innerHTML = pages[0].map(event => renderEventCard(event)).join('');
    } else {
        // Carousel mode or multiple events on single page
        let slidesHtml = pages.map((page, index) => `
            <div class="carousel-slide ${index === 0 ? 'active' : ''}" style="height: 100%; flex-direction: column; gap: 0.5vh;">
                ${page.map(event => renderEventCard(event)).join('')}
            </div>
        `).join('');

        // Put slides and indicators in the container
        container.innerHTML = slidesHtml + (pages.length > 1 ? '<div class="carousel-indicators event-indicators"></div>' : '');

        // Initialize carousel logic for events if multiple pages
        if (pages.length > 1) {
            initCarousel('events-container');
        }
    }
}

function renderEventCard(event: EventItem): string {
    const hasImage = !!event.image;

    // Format date nicely: "Mer. 4 Mars - 14:30"
    let formattedDate = event.date;
    try {
        const dateObj = new Date(event.date);
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        };
        formattedDate = new Intl.DateTimeFormat('fr-FR', options).format(dateObj);
        formattedDate = formattedDate.replace(',', ' -');
        formattedDate = formattedDate.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    } catch (e) {
        console.error("Error formatting date:", e);
    }

    return `
        <div class="event-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
            <div class="event-date">${formattedDate}</div>
            ${event.image ? `<img src="${event.image}" alt="${event.title}" style="flex: 1; width: 100%; min-height: 0; object-fit: contain; border-radius: 8px; margin-bottom: 0.3vh; background: rgba(0,0,0,0.2);">` : ''}
            <div style="flex-shrink: 0;">
                <h3 style="font-size: clamp(1rem, 1.2vw, 1.3rem); margin-bottom: 0.2vh; font-weight: 700; color: white;">${event.title}</h3>
                <p style="font-size: clamp(0.75rem, 0.9vw, 1rem); margin-bottom: 0; line-height: 1.1; opacity: 0.9; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${event.description}</p>
            </div>
        </div>
    `;
}

function renderFlashNews(newsItems: FlashNewsItem[]) {
    const container = document.getElementById('flash-news-container');
    if (!container) return;
    const content = container.querySelector('.flash-news-content');
    if (!content) return;

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

// Global state for carousels to manage auto-play and current index across re-renders
const carouselStates: Record<string, { interval: any, currentIndex: number }> = {};

function initCarousel(carouselId: string) {
    const container = document.getElementById(carouselId);
    if (!container) return;

    const slides = container.querySelectorAll('.carousel-slide');
    if (slides.length === 0) return;

    const indicatorsContainer = container.querySelector('.carousel-indicators');

    // Clear existing interval if it exists
    if (carouselStates[carouselId]) {
        clearInterval(carouselStates[carouselId].interval);
    } else {
        carouselStates[carouselId] = { interval: null, currentIndex: 0 };
    }

    const state = carouselStates[carouselId];
    if (state.currentIndex >= slides.length) {
        state.currentIndex = 0;
    }

    // Generate Indicators
    if (indicatorsContainer) {
        indicatorsContainer.innerHTML = ''; // Clear existing
        slides.forEach((_, index) => {
            const indicator = document.createElement('div');
            indicator.className = `indicator ${index === 0 ? 'active' : ''}`;
            indicator.addEventListener('click', () => {
                state.currentIndex = index;
                showSlide(state.currentIndex);
                startAutoPlay();
            });
            indicatorsContainer.appendChild(indicator);
        });
    }

    function showSlide(index: number) {
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
        state.currentIndex = (state.currentIndex + 1) % slides.length;
        showSlide(state.currentIndex);
    }

    function startAutoPlay() {
        if (state.interval) clearInterval(state.interval);
        state.interval = setInterval(nextSlide, 5000);
    }

    function stopAutoPlay() {
        if (state.interval) clearInterval(state.interval);
    }

    container.addEventListener('mouseenter', stopAutoPlay);
    container.addEventListener('mouseleave', startAutoPlay);

    showSlide(state.currentIndex);
    startAutoPlay();
}

/* --- Edit Modal Logic --- */

function initEditModal() {
    const modal = document.getElementById('edit-modal');
    const editBtn = document.getElementById('edit-btn') as HTMLButtonElement;
    const closeBtn = document.querySelector('.close-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    const categorySelect = document.getElementById('category-select') as HTMLSelectElement;
    const dynamicForm = document.getElementById('dynamic-form');

    if (!modal || !editBtn || !saveBtn || !categorySelect || !dynamicForm) return;

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
        if (modal) modal.style.display = 'none';
        if (categorySelect) categorySelect.value = "";
        if (dynamicForm) dynamicForm.innerHTML = "";
        if (saveBtn) saveBtn.disabled = true;
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Will be handled globally or we can keep this, but let's be careful with multiple modals.
    // For now, keep it on modal itself.
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Handle Category Selection
    categorySelect.addEventListener('change', async (e) => {
        const target = e.target as HTMLSelectElement;
        const category = target.value;
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
        if (!category || !dynamicForm) return;

        const formData: Record<string, any> = {};
        const inputs = dynamicForm.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');

        // Handle File Upload first if present
        const fileInput = dynamicForm.querySelector('input[type="file"]') as HTMLInputElement;
        let uploadedImagePath = '';

        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            try {
                // Upload the file using FormData
                const formDataUpload = new FormData();
                formDataUpload.append('file', file);

                const uploadResponse = await fetch('/api/upload', {
                    method: 'POST',
                    body: formDataUpload
                });

                if (uploadResponse.ok) {
                    const uploadData = await uploadResponse.json();
                    uploadedImagePath = uploadData.path;
                } else {
                    const err = await uploadResponse.json();
                    alert('Échec du téléchargement : ' + (err.detail || 'Erreur inconnue'));
                    return;
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                alert('Erreur lors du téléchargement de l\'image.');
                return;
            }
        }

        inputs.forEach(input => {
            if (input.type === 'file') {
                if (uploadedImagePath) {
                    formData[input.name] = uploadedImagePath;
                }
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
            } else if (category === 'events' || category === 'flashNews') {
                if (formData['description'] !== undefined) {
                    formData['description'] += `\n\n - ${currentUser.username}`;
                } else if (formData['text'] !== undefined) {
                    formData['text'] += `\n\n - ${currentUser.username}`;
                }
            }
        }

        // Basic Validation
        if (category === 'recruits' && !uploadedImagePath) {
            alert('La photo est obligatoire pour une nouvelle recrue !');
            return;
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

function renderFormFields(category: string, container: HTMLElement) {
    let fields: any[] = [];

    switch (category) {
        case 'chiefMessages':
            fields = [
                { name: 'text', label: 'Message', type: 'textarea' },
                { name: 'image', label: 'Image (Optionnel)', type: 'file' }
            ];
            break;
        case 'amicalistMessages':
            fields = [
                { name: 'text', label: 'Message', type: 'textarea' },
                { name: 'image', label: 'Image (Optionnel)', type: 'file' }
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
                { name: 'date', label: 'Date et Heure', type: 'datetime-local' },
                { name: 'title', label: 'Titre', type: 'text' },
                { name: 'description', label: 'Description', type: 'textarea' },
                { name: 'image', label: 'Image (Optionnel)', type: 'file' }
            ];
            break;
        case 'flashNews':
            fields = [
                { name: 'text', label: 'Message Flash', type: 'textarea' },
                { name: 'endTime', label: 'Date et Heure de fin', type: 'datetime-local' }
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

function renderExistingItems(category: string, items: any[], container: HTMLElement) {
    const listContainer = document.createElement('div');
    listContainer.id = 'existing-items-container';
    listContainer.style.marginTop = '20px';
    listContainer.style.borderTop = '1px solid #eee';
    listContainer.style.paddingTop = '10px';

    const title = document.createElement('h3');
    title.textContent = 'Éléments existants :';
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
        deleteBtn.textContent = 'Supprimer';
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
    if (container.parentNode) {
        container.parentNode.insertBefore(listContainer, container.nextSibling);
    }
}

async function deleteItem(category: string, item: any) {
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
            const categorySelect = document.getElementById('category-select') as HTMLSelectElement;
            if (categorySelect) categorySelect.dispatchEvent(new Event('change'));
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

function getWeatherIcon(code: number): string {
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

function getWeatherDesc(code: number): string {
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
    setupLogsModal();
}

function handleSession(user: any) {
    currentUser = user;
    isUserValidated = user.is_validated;
    updateAuthUI();
}

function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const editBtn = document.getElementById('edit-btn') as HTMLButtonElement;
    const logsBtn = document.getElementById('logs-btn');

    if (currentUser) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (signupBtn) signupBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';

        if (isUserValidated) {
            if (editBtn) {
                editBtn.style.display = 'block';
                editBtn.disabled = false;
                editBtn.title = '';
            }
            if (logsBtn) logsBtn.style.display = 'block';
        } else {
            if (editBtn) {
                editBtn.style.display = 'block';
                editBtn.disabled = true;
                editBtn.title = 'Votre compte est en attente de validation par un administrateur.';
            }
            if (logsBtn) logsBtn.style.display = 'none';
        }
    } else {
        if (loginBtn) loginBtn.style.display = 'block';
        if (signupBtn) signupBtn.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
        if (logsBtn) logsBtn.style.display = 'none';
    }
}

function setupAuthModals() {
    const loginModal = document.getElementById('login-modal');
    const signupModal = document.getElementById('signup-modal');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const closeBtns = document.querySelectorAll('.close-btn');

    if (loginBtn && loginModal) {
        loginBtn.addEventListener('click', () => loginModal.style.display = 'block');
    }
    if (signupBtn && signupModal) {
        signupBtn.addEventListener('click', () => signupModal.style.display = 'block');
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('access_token');
            currentUser = null;
            isUserValidated = false;
            updateAuthUI();
        });
    }

    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (loginModal) loginModal.style.display = 'none';
            if (signupModal) signupModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === loginModal) if (loginModal) loginModal.style.display = 'none';
        if (event.target === signupModal) if (signupModal) signupModal.style.display = 'none';
    });

    // Handle Forms
    const loginForm = document.getElementById('login-form') as HTMLFormElement;
    const signupForm = document.getElementById('signup-form') as HTMLFormElement;

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = (document.getElementById('login-username') as HTMLInputElement).value;
            const password = (document.getElementById('login-password') as HTMLInputElement).value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();
                if (response.ok) {
                    localStorage.setItem('access_token', data.access_token);
                    handleSession(data.user);
                    if (loginModal) loginModal.style.display = 'none';
                } else {
                    alert(data.detail);
                }
            } catch (error) {
                console.error('Login failed', error);
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = (document.getElementById('signup-username') as HTMLInputElement).value;
            const password = (document.getElementById('signup-password') as HTMLInputElement).value;

            try {
                const response = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();
                if (response.ok) {
                    alert('Compte créé ! Un administrateur doit valider votre compte.');
                    if (signupModal) signupModal.style.display = 'none';
                } else {
                    alert(data.detail);
                }
            } catch (error) {
                console.error('Signup failed', error);
            }
        });
    }
}

function setupLogsModal() {
    const logsModal = document.getElementById('logs-modal');
    const logsBtn = document.getElementById('logs-btn');
    const logsContent = document.getElementById('logs-content');
    const closeBtn = logsModal?.querySelector('.close-btn');

    if (logsBtn && logsModal) {
        logsBtn.addEventListener('click', async () => {
            logsModal.style.display = 'block';
            if (logsContent) logsContent.innerHTML = 'Chargement...';
            try {
                const token = localStorage.getItem('access_token');
                const response = await fetch('/api/logs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const logs = await response.json();
                    if (logsContent) {
                        logsContent.innerHTML = logs.map((log: any) => `
                        <div class="log-entry" style="border-bottom: 1px solid #444; padding: 10px 0;">
                            <span style="color: #666; font-size: 0.8em;">${new Date(log.timestamp).toLocaleString()}</span>
                            <span style="color: var(--primary-red); font-weight: bold; margin: 0 10px;">${log.username}</span>
                            <span>${log.action}</span>
                            <div style="font-size: 0.9em; color: #aaa; margin-top: 5px;">${JSON.stringify(log.details)}</div>
                        </div>
                    `).join('');
                    }
                }
            } catch (error) {
                console.error('Logs fetch failed', error);
                if (logsContent) logsContent.innerHTML = 'Erreur lors du chargement des logs.';
            }
        });
    }

    if (closeBtn && logsModal) {
        closeBtn.addEventListener('click', () => {
            logsModal.style.display = 'none';
        });
    }
}
