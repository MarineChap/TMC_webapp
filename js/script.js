document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initEditModal();
    startAutoReload();
});

async function loadData() {
    try {
        const response = await fetch('data/db.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        renderCarousel('chief-carousel', data.chiefMessages);
        renderCarousel('amicalist-carousel', data.amicalistMessages);
        renderRecruits(data.recruits);
        renderEvents(data.events);

        // Initialize carousel logic after rendering
        initCarousel('chief-carousel');
        initCarousel('amicalist-carousel');

    } catch (error) {
        console.error('Could not load data:', error);
    }
}

let lastModifiedTime = 0;

function startAutoReload() {
    setInterval(async () => {
        try {
            const response = await fetch('/api/last-modified');
            if (response.ok) {
                const data = await response.json();
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

        let content = `<blockquote>"${msg.text}"</blockquote>`;
        if (msg.author) {
            content += `<cite>- ${msg.author}</cite>`;
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
            <h3>${event.title}</h3>
            <p>${event.description}</p>
        </div>
    `).join('');
}

function initCarousel(carouselId) {
    const container = document.getElementById(carouselId);
    if (!container) return;

    const slides = container.querySelectorAll('.carousel-slide');
    if (slides.length === 0) return;

    const prevBtn = container.querySelector('.prev-btn');
    const nextBtn = container.querySelector('.next-btn');
    let currentIndex = 0;
    let autoPlayInterval;

    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.remove('active');
            if (i === index) {
                slide.classList.add('active');
            }
        });
    }

    function nextSlide() {
        currentIndex = (currentIndex + 1) % slides.length;
        showSlide(currentIndex);
    }

    function prevSlide() {
        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
        showSlide(currentIndex);
    }

    function startAutoPlay() {
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        autoPlayInterval = setInterval(nextSlide, 5000);
    }

    function stopAutoPlay() {
        clearInterval(autoPlayInterval);
    }

    if (nextBtn) {
        const newNext = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNext, nextBtn);
        newNext.addEventListener('click', () => {
            nextSlide();
            stopAutoPlay();
            startAutoPlay();
        });
    }

    if (prevBtn) {
        const newPrev = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrev, prevBtn);
        newPrev.addEventListener('click', () => {
            prevSlide();
            stopAutoPlay();
            startAutoPlay();
        });
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

    // Open Modal
    editBtn.addEventListener('click', () => {
        modal.style.display = 'block';
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
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Handle Category Selection
    categorySelect.addEventListener('change', (e) => {
        const category = e.target.value;
        dynamicForm.innerHTML = "";

        if (category) {
            saveBtn.disabled = false;
            renderFormFields(category, dynamicForm);
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
        inputs.forEach(input => {
            formData[input.name] = input.value;
        });

        // Basic Validation
        for (const key in formData) {
            if (!formData[key]) {
                alert('Please fill in all fields');
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
                alert('Item saved successfully!');
                closeModal();
                loadData(); // Refresh UI
            } else {
                alert('Failed to save item.');
            }
        } catch (error) {
            console.error('Error saving data:', error);
            alert('Error saving data. Make sure server.py is running.');
        }
    });
}

function renderFormFields(category, container) {
    let fields = [];

    switch (category) {
        case 'chiefMessages':
            fields = [
                { name: 'text', label: 'Message', type: 'textarea' },
                { name: 'author', label: 'Author (Group)', type: 'text' }
            ];
            break;
        case 'amicalistMessages':
            fields = [
                { name: 'text', label: 'Message', type: 'textarea' }
            ];
            break;
        case 'recruits':
            fields = [
                { name: 'name', label: 'Name', type: 'text' },
                { name: 'image', label: 'Image Path (e.g., assets/images/recruit1.jpg)', type: 'text', value: 'assets/images/recruit1.jpg' },
                { name: 'description', label: 'Description', type: 'textarea' }
            ];
            break;
        case 'events':
            fields = [
                { name: 'date', label: 'Date (e.g., 15 Decembre 2025, 17H00)', type: 'text' },
                { name: 'title', label: 'Title', type: 'text' },
                { name: 'description', label: 'Description', type: 'textarea' }
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
