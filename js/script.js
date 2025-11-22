document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initEditModal();
    startAutoReload();
    displayServerIP();
});

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
                ipInfo.innerHTML = `Access from network: <strong>http://${data.ip}:${data.port}</strong>`;
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

function renderExistingItems(category, items, container) {
    const listContainer = document.createElement('div');
    listContainer.id = 'existing-items-container';
    listContainer.style.marginTop = '20px';
    listContainer.style.borderTop = '1px solid #eee';
    listContainer.style.paddingTop = '10px';

    const title = document.createElement('h3');
    title.textContent = 'Existing Items';
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
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.backgroundColor = '#ff4444';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.padding = '5px 10px';
        deleteBtn.style.borderRadius = '3px';
        deleteBtn.style.cursor = 'pointer';

        deleteBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete this item?')) {
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
            alert('Item deleted successfully!');
            // Refresh the list
            const categorySelect = document.getElementById('category-select');
            categorySelect.dispatchEvent(new Event('change'));
            loadData(); // Refresh main view
        } else {
            alert('Failed to delete item.');
        }
    } catch (error) {
        console.error('Error deleting item:', error);
        alert('Error deleting item.');
    }
}
