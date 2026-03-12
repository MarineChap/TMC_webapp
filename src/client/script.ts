import { SdmisNewsCarousel } from './sdmisCarousel';

let currentUser: any = null;
let isUserValidated = false;
let trafficMapInstance: any = null;

interface CarouselItem {
    text?: string;
    description?: string;
    author?: string;
    title?: string;
    image?: string;
    images?: string[];
    name?: string;
    displayAuthor?: boolean;
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
    fetchWeatherAlerts();
    fetchTrafficIncidents();
    checkInitialLogsRoute();

    // Periodic Refresh for Weather and Traffic (every 5 minutes)
    setInterval(() => {
        fetchWeather();
        fetchWeatherAlerts();
        fetchTrafficIncidents();
    }, 300000);

    const sdmisCarousel = new SdmisNewsCarousel('sdmis-carousel');
    sdmisCarousel.init();

    // Parse initial emojis (like the logo)
    if ((window as any).twemoji) (window as any).twemoji.parse(document.body);
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
            const footerText = document.getElementById('footer-text');
            if (footerText) {
                footerText.innerHTML += ` | Connectez-vous : <strong>http://${data.ip}:${data.port}</strong>`;
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

        renderMainCarousel(data);
        renderEvents(data.events);

        currentFlashNews = data.flashNews || [];
        renderFlashNews(currentFlashNews);

        // Initialize carousel logic after rendering
        initCarousel('main-carousel');

        if ((window as any).twemoji) (window as any).twemoji.parse(document.body);
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

function renderMainCarousel(data: DbData) {
    const container = document.getElementById('main-carousel');
    if (!container) return;

    // Clear existing slides except indicators
    const existingSlides = container.querySelectorAll('.carousel-slide');
    existingSlides.forEach(slide => slide.remove());

    const indicators = container.querySelector('.carousel-indicators');

    // Reset traffic map instance because the DOM element is about to be replaced
    trafficMapInstance = null;

    const slides: { title: string, content: string, type?: string }[] = [];

    // Add Chief Messages
    data.chiefMessages.forEach(msg => {
        const hasImage = !!(msg.image || (msg.images && msg.images.length > 0));
        slides.push({
            title: "Messages Encadrement",
            content: renderStandardSlide(msg),
            type: hasImage ? 'message-image' : 'message'
        });
    });

    // Add Amicalist Messages
    data.amicalistMessages.forEach(msg => {
        const hasImage = !!(msg.image || (msg.images && msg.images.length > 0));
        slides.push({
            title: "Messages Amicale",
            content: renderStandardSlide(msg),
            type: hasImage ? 'message-image' : 'message'
        });
    });

    const isMobile = window.innerWidth <= 768;
    const recruitChunkSize = isMobile ? 1 : 3;
    // Add Recruits (chunks of 3)
    const recruitChunks: CarouselItem[][] = [];
    for (let i = 0; i < data.recruits.length; i += recruitChunkSize) {
        recruitChunks.push(data.recruits.slice(i, i + recruitChunkSize));
    }

    recruitChunks.forEach(chunk => {
        slides.push({
            title: "Nouveaux Engagés",
            content: `
                <div class="recruits-row">
                    ${chunk.map(msg => `
                        <div class="recruit-card-mini">
                            <img src="${msg.image}" alt="${msg.name}">
                            <div class="recruit-info">
                                <div class="recruit-name">${msg.name}</div>
                                ${(msg.description || '').trim() ? `<p>${msg.description}</p>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `,
            type: 'recruits'
        });
    });

    // Add Traffic Page
    slides.push({
        title: "Trafic & Circulation",
        content: `
            <div class="carousel-slide-content">
                <div class="traffic-container" style="height: 100%; width: 100%;">
                    <div id="traffic-map" style="width: 100%; height: 100%; border-radius: 12px; overflow: hidden;"></div>
                </div>
            </div>
        `,
        type: 'traffic'
    });

    slides.forEach((slideData, index) => {
        const slide = document.createElement('div');
        slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`;
        if (slideData.type) slide.dataset.slideType = slideData.type;
        slide.innerHTML = `
            <h2 class="carousel-section-title">${slideData.title}</h2>
            ${slideData.content}
        `;
        if (indicators) {
            container.insertBefore(slide, indicators);
        } else {
            container.appendChild(slide);
        }
    });

    // Traffic map is initialized lazily when the slide becomes visible (see initCarousel/showSlide)
    // so we don't call initTrafficMap() here to avoid zero-size initialization
}

function initTrafficMap() {
    const L = (window as any).L;
    if (!L) return;

    const trafficMapContainer = document.getElementById('traffic-map');
    if (!trafficMapContainer) return;

    // If already initialized, just return
    if (trafficMapInstance) return;

    const lat = 45.644;
    const lon = 4.797;

    trafficMapInstance = L.map('traffic-map').setView([lat, lon], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(trafficMapInstance);

    // Add TomTom Traffic Flow Layer
    const tomtomKey = 'sd4npPH6dTyPskdvxFQG0pVgnhBXrJAX';
    // Use 'relative' instead of 'relative0' for reliability, and ensuring it's the latest supported for this style
    L.tileLayer(`https://{s}.api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=${tomtomKey}`, {
        subdomains: 'abcd',
        tileSize: 256,
        zoomOffset: 0,
        opacity: 0.7
    }).addTo(trafficMapInstance);

    fetchTrafficIncidents();
}

async function fetchTrafficIncidents() {
    const container1 = document.getElementById('traffic-alerts-1');
    const container2 = document.getElementById('traffic-alerts-2');
    if (!container1 || !container2) return;

    try {
        console.log("Fetching traffic incidents...");
        const response = await fetch('/api/traffic-incidents');
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Traffic incidents API error:', errorText);
            throw new Error('Traffic incidents failed');
        }

        const data = await response.json();
        console.log("Traffic data received:", data);

        const incidents = data.incidents || data.features || [];

        const categoryLabels: Record<number, string> = {
            0: 'Incident inconnu',
            1: 'Accident',
            2: 'Brouillard',
            3: 'Conditions dangereuses',
            4: 'Pluie intense',
            5: 'Verglas',
            6: 'Embouteillage',
            7: 'Voie fermée',
            8: 'Route fermée',
            9: 'Travaux',
            10: 'Vent fort',
            11: 'Inondation',
            14: 'Véhicule en panne'
        };

        if (incidents.length > 0) {
            // Taluyers center coordinates
            const centerLat = 45.6411;
            const centerLon = 4.7214;

            // Helper to calculate distance (simple pythagorean for small distances)
            const getDistance = (lat1: number, lon1: number) => {
                return Math.sqrt(Math.pow(lat1 - centerLat, 2) + Math.pow(lon1 - centerLon, 2));
            };

            const processedIncidents = incidents.map((f: any) => {
                const props = f.properties || f;
                const geom = f.geometry || {};

                let lat = centerLat, lon = centerLon;
                if (geom.type === 'Point') {
                    [lon, lat] = geom.coordinates;
                } else if (geom.type === 'LineString' && geom.coordinates.length > 0) {
                    [lon, lat] = geom.coordinates[0];
                }

                return {
                    ...f,
                    distance: getDistance(lat, lon),
                    props: props
                };
            });

            // Sort by distance and take 10 closest
            const sortedIncidents = processedIncidents
                .sort((a: any, b: any) => a.distance - b.distance)
                .slice(0, 10);

            const renderIncident = (f: any, idx: number) => {
                const props = f.props;
                const cat = props.iconCategory;
                const label = categoryLabels[cat] || `Incident (cat. ${cat})`;
                const roads = (props.roadNumbers && props.roadNumbers.length > 0) ? ` (${props.roadNumbers.join(', ')})` : '';
                const fromTo = (props.from && props.to) ? `${props.from} ➔ ${props.to}` : (props.from || props.to || '');
                const events = props.events || [];
                const description = events.length > 0 && events[0].description ? events[0].description : '';

                let subtext = description;
                if (subtext.toLowerCase() === label.toLowerCase() || !subtext) {
                    subtext = fromTo || 'Localisation non précisée';
                } else if (fromTo) {
                    subtext = `<strong>${fromTo}</strong><br>${subtext}`;
                }

                return `<div class="traffic-alert-card ${idx === 0 ? 'active' : ''}">
                            <h4>${label}${roads}</h4>
                            <p>${subtext}</p>
                        </div>`;
            };

            // Split into two groups of 5
            const group1 = sortedIncidents.slice(0, 5);
            const group2 = sortedIncidents.slice(5, 10);

            const setupCarousels = () => {
                container1.innerHTML = group1.map((f, i) => renderIncident(f, i)).join('');
                container2.innerHTML = group2.map((f, i) => renderIncident(f, i)).join('');
                container1.style.display = 'flex';
                container2.style.display = 'flex';

                let currentIndex = 0;
                const cards1 = container1.querySelectorAll('.traffic-alert-card');
                const cards2 = container2.querySelectorAll('.traffic-alert-card');

                if ((window as any).trafficSyncInterval) {
                    clearInterval((window as any).trafficSyncInterval);
                }

                const total1 = cards1.length;
                const total2 = cards2.length;

                if (total1 > 1 || total2 > 1) {
                    (window as any).trafficSyncInterval = setInterval(() => {
                        if (total1 > 0) cards1[currentIndex % total1].classList.remove('active');
                        if (total2 > 0) cards2[currentIndex % total2].classList.remove('active');

                        currentIndex++;

                        if (total1 > 0) cards1[currentIndex % total1].classList.add('active');
                        if (total2 > 0) cards2[currentIndex % total2].classList.add('active');
                    }, 5000);
                }
            };

            setupCarousels();

        } else {
            const noAlerts = '<div class="traffic-no-alerts">Aucune alerte trafic.</div>';
            container1.innerHTML = noAlerts;
            container2.innerHTML = '';
        }
    } catch (error) {
        console.error('Error fetching traffic incidents:', error);
        container1.innerHTML = '<div class="traffic-no-alerts">Service trafic momentanément indisponible.</div>';
    }
}

async function fetchWeatherAlerts() {
    const container = document.getElementById('weather-alerts');
    if (!container) return;

    try {
        const response = await fetch('/api/weather-alerts');
        if (!response.ok) throw new Error('Weather alerts failed');
        const data = await response.json();

        // Server returns { alerts: [{level: 'yellow'|'orange'|'red', label: string}] }
        const alerts: { level: string; label: string }[] = data.alerts || [];

        if (alerts.length > 0) {
            container.innerHTML = alerts.map(a =>
                `<div class="weather-alert-item weather-alert-${a.level}">${a.label}</div>`
            ).join('');
        } else {
            container.innerHTML = '<div class="traffic-no-alerts">Pas d\'alertes météo en cours.</div>';
        }
    } catch (error) {
        console.error('Error fetching weather alerts:', error);
        container.innerHTML = '<div class="traffic-no-alerts">Service météo indisponible.</div>';
    }
}

function renderStandardSlide(msg: CarouselItem): string {
    const images = msg.images || (msg.image ? [msg.image] : []);
    const hasMultipleImages = images.length > 1;
    const hasAnyImage = images.length > 0;
    const textContent = (msg.text || msg.description || '').trim();

    let imagesHtml = '';
    if (hasMultipleImages) {
        imagesHtml = `
            <div class="image-gallery">
                ${images.map(img => `<img src="${img}" class="gallery-image" alt="Gallery Image">`).join('')}
            </div>
        `;
    } else if (hasAnyImage) {
        imagesHtml = `<img src="${images[0]}" class="carousel-big-image" alt="Message Image" style="width: 100%; object-fit: contain;">`;
    }

    if (textContent) {
        return `
            <div class="carousel-slide-content ${hasMultipleImages ? 'with-gallery' : ''}">
                <div class="carousel-text-content">
                    <blockquote style="font-size: clamp(1.8rem, 3.2vw, 3.8rem); max-height: 25vh; overflow: hidden;">${textContent}</blockquote>
                    ${msg.displayAuthor !== false ? (msg.author || msg.title ? `<cite><strong>${msg.author || msg.title}</strong></cite>` : '') : ''}
                </div>
                ${imagesHtml}
            </div>
        `;
    } else if (hasAnyImage) {
        return `
            <div class="carousel-slide-content only-image ${hasMultipleImages ? 'with-gallery' : ''}">
                ${imagesHtml}
            </div>
        `;
    } else {
        return `
            <div class="carousel-slide-content only-text" style="justify-content: center;">
                <blockquote style="font-size: clamp(3rem, 5vw, 6rem);">"${textContent}"</blockquote>
                ${msg.displayAuthor !== false ? (msg.author || msg.title ? `<cite><strong>${msg.author || msg.title}</strong></cite>` : '') : ''}
            </div>
        `;
    }
}

// function renderRecruits(recruits: CarouselItem[]) { ... } // No longer used

function renderEvents(events: EventItem[]) {
    const carousel = document.getElementById('events-carousel');
    if (!carousel) return;

    if (!events || events.length === 0) {
        carousel.innerHTML = '<p style="text-align: center; opacity: 0.7; width: 100%; color: white;">Aucun événement prévu.</p>';
        return;
    }

    // Sort events by date
    const sortedEvents = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Chunk into 4 for paging
    const isMobile = window.innerWidth <= 768;
    const eventChunkSize = isMobile ? 1 : 4;
    const chunks: EventItem[][] = [];
    for (let i = 0; i < sortedEvents.length; i += eventChunkSize) {
        chunks.push(sortedEvents.slice(i, i + eventChunkSize));
    }

    carousel.innerHTML = `
        <div class="carousel-indicators event-indicators"></div>
        ${chunks.map((chunk, index) => `
            <div class="carousel-slide ${index === 0 ? 'active' : ''}">
                ${chunk.map(event => renderEventCard(event)).join('')}
            </div>
        `).join('')}
    `;

    // Start carousel with indicators and auto-play
    initCarousel('events-carousel');
}

function renderEventCard(event: EventItem): string {
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
    } catch (e) {
        console.error("Error formatting date:", e);
    }

    return `
        <div class="event-card">
            <div class="event-date">${formattedDate}</div>
            ${event.title ? `<h3 class="event-title">${event.title}</h3>` : ''}
            <div class="event-body">
                ${(event.description || '').trim() ? `<p class="event-desc">${event.description}</p>` : ''}
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
        document.body.classList.remove('flash-active');
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
        document.body.classList.add('flash-active');
    } else {
        container.style.display = 'none';
        document.body.classList.remove('flash-active');
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
                // Fix for Leaflet map: init on first view, then invalidateSize
                if (slide.querySelector('#traffic-map')) {
                    if (!trafficMapInstance && (window as any).L) {
                        // Initialize map now that the container is visible
                        setTimeout(() => initTrafficMap(), 50);
                    } else if (trafficMapInstance) {
                        setTimeout(() => trafficMapInstance.invalidateSize(), 50);
                    }
                }
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

    const BASE_DURATION = 5000;

    function getSlideDuration(index: number): number {
        const slide = slides[index] as HTMLElement;
        const type = slide?.dataset?.slideType || '';
        if (type === 'traffic' || type === 'recruits') return BASE_DURATION * 2;
        if (type === 'message-image') return BASE_DURATION * 1.5;
        return BASE_DURATION;
    }

    function nextSlide() {
        state.currentIndex = (state.currentIndex + 1) % slides.length;
        showSlide(state.currentIndex);
        scheduleNext();
    }

    function scheduleNext() {
        if (state.interval) clearTimeout(state.interval);
        state.interval = setTimeout(nextSlide, getSlideDuration(state.currentIndex));
    }

    function startAutoPlay() {
        if (state.interval) clearTimeout(state.interval);
        scheduleNext();
    }

    function stopAutoPlay() {
        if (state.interval) clearTimeout(state.interval);
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
        const fileInputs = dynamicForm.querySelectorAll<HTMLInputElement>('input[type="file"]');
        let uploadedPaths: string[] = [];

        for (const fileInput of Array.from(fileInputs)) {
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                try {
                    const formDataUpload = new FormData();
                    // Append all files from this input
                    Array.from(fileInput.files).forEach(file => {
                        formDataUpload.append('files', file);
                    });

                    const token = localStorage.getItem('access_token');
                    const uploadResponse = await fetch('/api/upload', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formDataUpload
                    });

                    if (uploadResponse.ok) {
                        const uploadData = await uploadResponse.json();
                        uploadedPaths = uploadedPaths.concat(uploadData.paths);
                    } else {
                        const err = await uploadResponse.json();
                        alert('Échec du téléchargement : ' + (err.detail || 'Erreur inconnue'));
                        return;
                    }
                } catch (error) {
                    console.error('Error uploading images:', error);
                    alert('Erreur lors du téléchargement des images.');
                    return;
                }
            }
        }

        inputs.forEach(input => {
            if (input.type === 'file') {
                if (uploadedPaths.length > 0) {
                    // Decide whether to store as string (legacy) or array
                    if (input.name === 'images') {
                        formData[input.name] = uploadedPaths;
                    } else {
                        formData[input.name] = uploadedPaths[0]; // Legacy fallback
                    }
                }
            } else if (input.type === 'checkbox') {
                formData[input.name] = (input as HTMLInputElement).checked;
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
            }
        }

        // Basic Validation
        if (category === 'recruits' && (!uploadedPaths || uploadedPaths.length === 0)) {
            alert('La photo est obligatoire pour une nouvelle recrue !');
            return;
        }

        // Send to Server
        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
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
                { name: 'images', label: 'Images (Optionnel)', type: 'file', multiple: true },
                { name: 'displayAuthor', label: 'Afficher l\'auteur', type: 'checkbox', value: true }
            ];
            break;
        case 'amicalistMessages':
            fields = [
                { name: 'text', label: 'Message', type: 'textarea' },
                { name: 'images', label: 'Images (Optionnel)', type: 'file', multiple: true },
                { name: 'displayAuthor', label: 'Afficher l\'auteur', type: 'checkbox', value: true }
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
                { name: 'description', label: 'Description', type: 'textarea' }
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
            : `<input type="${field.type}" id="${field.name}" name="${field.name}" 
                value="${field.value || ''}" 
                ${field.multiple ? 'multiple' : ''} 
                ${field.type === 'checkbox' && field.value ? 'checked' : ''}>`
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
        const token = localStorage.getItem('access_token');
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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

    // Millery coordinates
    const lat = 45.644;
    const lon = 4.797;

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
        if ((window as any).twemoji) (window as any).twemoji.parse(container);

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
    const logsContent = document.getElementById('logs-list');
    const closeBtn = logsModal?.querySelector('.close-logs-btn');

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
