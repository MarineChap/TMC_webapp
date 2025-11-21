document.addEventListener('DOMContentLoaded', () => {
    loadData();
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

function renderCarousel(containerId, messages) {
    const container = document.getElementById(containerId);
    if (!container) return;

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
        // Clear any existing interval to avoid duplicates
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        autoPlayInterval = setInterval(nextSlide, 5000);
    }

    function stopAutoPlay() {
        clearInterval(autoPlayInterval);
    }

    // Remove existing event listeners to prevent duplicates if called multiple times
    // (Note: simpler to just clone and replace buttons if we wanted to be 100% clean, 
    // but since we run this once after load, it's fine. 
    // If we re-ran init, we'd need to be careful.)

    if (nextBtn) {
        // Clone to remove old listeners
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

    // Pause on hover
    container.addEventListener('mouseenter', stopAutoPlay);
    container.addEventListener('mouseleave', startAutoPlay);

    // Initial start
    showSlide(currentIndex);
    startAutoPlay();
}
