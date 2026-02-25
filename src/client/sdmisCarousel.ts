export interface SdmisPost {
    id: number | string;
    title: string;
    link: string;
    excerpt: string;
    imageUrl: string;
}

export class SdmisNewsCarousel {
    private containerId: string;
    private posts: SdmisPost[] = [];
    private currentIndex: number = 0;
    private intervalId: number | null = null;
    private refreshIntervalId: number | null = null;
    private readonly FALLBACK_LOGO = 'https://www.sdmis.fr/wp-content/uploads/2021/07/logo-sdmis-fb.png';
    private readonly API_URL = '/api/sdmis-rss';

    constructor(containerId: string) {
        this.containerId = containerId;
    }

    public async init(): Promise<void> {
        await this.fetchData();
        this.render();
        this.startAutoPlay();
        this.startAutoRefresh();
    }

    private async fetchData(): Promise<void> {
        try {
            const response = await fetch(this.API_URL);
            if (!response.ok) throw new Error('SDMIS RSS feed request failed');
            const xmlText = await response.text();

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            const items = xmlDoc.querySelectorAll("item");

            this.posts = Array.from(items).slice(0, 6).map((item, index) => {
                const title = item.querySelector("title")?.textContent || "";
                const link = item.querySelector("link")?.textContent || "";
                const description = item.querySelector("description")?.textContent || "";

                // Try to find image in description or content:encoded
                const contentEncoded = item.getElementsByTagName("content:encoded")[0]?.textContent || "";
                const combinedContent = description + contentEncoded;
                const imgRegex = /<img[^>]+src="([^">]+)"/i;
                let imageUrl = this.FALLBACK_LOGO;

                const match = imgRegex.exec(combinedContent);
                if (match && match[1]) {
                    imageUrl = match[1];
                    // Handle relative URLs
                    if (imageUrl.startsWith('/')) {
                        imageUrl = 'https://www.sdmis.fr' + imageUrl;
                    }
                }

                return {
                    id: index,
                    title: title,
                    link: link,
                    excerpt: description.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...',
                    imageUrl: imageUrl
                };
            });

        } catch (error) {
            console.error('Error fetching/parsing SDMIS RSS:', error);
            this.posts = [];
        }
    }

    private startAutoPlay(): void {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = window.setInterval(() => {
            this.nextSlide();
        }, 12000); // 12 seconds
    }

    private startAutoRefresh(): void {
        if (this.refreshIntervalId) clearInterval(this.refreshIntervalId);
        this.refreshIntervalId = window.setInterval(async () => {
            await this.fetchData();
            this.render();
        }, 60 * 60 * 1000); // 60 minutes
    }

    private nextSlide(): void {
        if (this.posts.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.posts.length;
        this.updateSlide();
    }

    private updateSlide(): void {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const slides = container.querySelectorAll('.sdmis-slide');
        slides.forEach((slide, index) => {
            slide.classList.toggle('active', index === this.currentIndex);
        });

        const indicators = container.querySelectorAll('.sdmis-indicator');
        indicators.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === this.currentIndex);
        });
    }

    private render(): void {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        if (this.posts.length === 0) {
            container.innerHTML = `
                <div class="sdmis-error">
                    <img src="${this.FALLBACK_LOGO}" alt="SDMIS Logo" class="sdmis-fallback-logo">
                    <p>Actualités SDMIS indisponibles pour le moment.</p>
                </div>
            `;
            return;
        }

        let html = '<div class="sdmis-slides-container">';
        this.posts.forEach((post, index) => {
            html += `
                <div class="sdmis-slide ${index === this.currentIndex ? 'active' : ''}" style="background-image: url('${post.imageUrl}')">
                    <div class="sdmis-overlay">
                        <div class="sdmis-content">
                            <h2 class="sdmis-title">${post.title}</h2>
                            <p class="sdmis-excerpt">${post.excerpt}</p>
                            <a href="${post.link}" target="_blank" class="sdmis-link">Lire la suite</a>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        // Indicators
        html += '<div class="sdmis-indicators">';
        this.posts.forEach((_, index) => {
            html += `<span class="sdmis-indicator ${index === this.currentIndex ? 'active' : ''}" data-index="${index}"></span>`;
        });
        html += '</div>';

        container.innerHTML = html;

        // Add event listeners for indicators
        container.querySelectorAll('.sdmis-indicator').forEach(indicator => {
            indicator.addEventListener('click', (e) => {
                const index = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
                this.currentIndex = index;
                this.updateSlide();
                this.startAutoPlay(); // Reset timer
            });
        });
    }
}
